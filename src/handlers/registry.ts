/**
 * Handler Registry
 *
 * Central registry that manages all TV brand handlers.
 * During discovery, it scans the network and uses each registered handler
 * to identify devices, automatically selecting the right protocol.
 *
 * Usage:
 *   import { registry } from './registry';
 *   import { SamsungTizenHandler } from './samsung/SamsungTizenHandler';
 *
 *   // Register handlers (done once at app startup)
 *   registry.register(new SamsungTizenHandler());
 *
 *   // Discover all TVs on the network
 *   const devices = await registry.discoverAll();
 *
 *   // Connect to a specific device
 *   const handler = registry.getHandler(device);
 *   await handler.connect(device);
 */

import { NativeModules, Platform } from 'react-native';
import type { TvHandler, TvDevice, TvBrand, ConnectionListener, StandardRemoteKey, RemoteKeyGroup } from './types';
import { SamsungTizenHandler } from './samsung/SamsungTizenHandler';

const { SamsungTvRemote } = NativeModules;

class HandlerRegistry {
  private handlers: TvHandler[] = [];
  private activeHandler: TvHandler | null = null;
  private activeDevice: TvDevice | null = null;
  private activeUnsubscribe: (() => void) | null = null;
  private connectionListeners: Set<ConnectionListener> = new Set();

  // ───────────────────────────────────────────
  // Handler Registration
  // ───────────────────────────────────────────

  /** Register a TV handler. Call this at app startup for each supported brand. */
  register(handler: TvHandler): void {
    // Avoid duplicate registration
    if (this.handlers.some((h) => h.brand === handler.brand)) {
      console.warn(`[Registry] Handler for ${handler.brand} already registered, skipping.`);
      return;
    }
    this.handlers.push(handler);
  }

  /** Get all registered handlers. */
  getRegisteredHandlers(): TvHandler[] {
    return [...this.handlers];
  }

  /** Get handler by brand. */
  getHandlerByBrand(brand: TvBrand): TvHandler | undefined {
    return this.handlers.find((h) => h.brand === brand);
  }

  /** Get the handler for a specific device. */
  getHandler(device: TvDevice): TvHandler | undefined {
    return this.handlers.find((h) => h.brand === device.brand);
  }

  // ───────────────────────────────────────────
  // Discovery
  // ───────────────────────────────────────────

  /**
   * Discover all TVs on the local network.
   *
   * Strategy:
   * 1. Try SSDP multicast (fast, but unreliable on many Android phones).
   * 2. Get device IP and scan the local subnet on known TV ports (reliable fallback).
   * 3. For each candidate IP, ask every handler to identify it.
   * 4. Return all successfully identified devices.
   */
  async discoverAll(): Promise<TvDevice[]> {
    console.log('[Registry] Starting discovery...');

    // Step 1: Get raw IPs from SSDP
    let rawIps: string[] = [];
    try {
      rawIps = await this.getSsdpIps();
      console.log(`[Registry] SSDP found ${rawIps.length} IPs: ${rawIps.join(', ')}`);
    } catch (e) {
      console.warn('[Registry] SSDP failed:', e);
    }

    // Step 2: Get device IP for subnet scanning
    let deviceIp: string | null = null;
    try {
      if (Platform.OS === 'android' && SamsungTvRemote?.getNetworkInfo) {
        const info = await SamsungTvRemote.getNetworkInfo();
        deviceIp = info?.ip || null;
        console.log(`[Registry] Device IP: ${deviceIp}`);
      }
    } catch {
      console.warn('[Registry] Could not get device IP');
    }

    // Step 3: Subnet scan fallback — probe known TV ports on the /24 subnet
    if (deviceIp && deviceIp !== 'Unknown') {
      const subnetIps = this.generateSubnetIps(deviceIp);
      // Filter out IPs we already got from SSDP
      const newIps = subnetIps.filter((ip) => !rawIps.includes(ip));
      console.log(`[Registry] Subnet scan: probing ${newIps.length} additional IPs...`);

      // Probe all subnet IPs in parallel (fast: just HTTP fetch with short timeout)
      const probeResults = await Promise.allSettled(
        newIps.map(async (ip) => {
          for (const handler of this.handlers) {
            try {
              const device = await handler.identify(ip);
              if (device) { return device; }
            } catch {}
          }
          return null;
        }),
      );

      const subnetDevices = probeResults
        .filter((r): r is PromiseFulfilledResult<TvDevice | null> => r.status === 'fulfilled')
        .map((r) => r.value)
        .filter((d): d is TvDevice => d !== null);

      if (subnetDevices.length > 0) {
        console.log(`[Registry] Subnet scan found ${subnetDevices.length} device(s)`);
        return subnetDevices.sort((a, b) => a.name.localeCompare(b.name));
      }
    }

    // Step 4: If SSDP returned IPs, identify them
    if (rawIps.length > 0) {
      const devices: TvDevice[] = [];
      const identifyPromises = rawIps.map(async (ip) => {
        for (const handler of this.handlers) {
          try {
            const device = await handler.identify(ip);
            if (device) {
              devices.push(device);
              return;
            }
          } catch {}
        }
      });

      await Promise.allSettled(identifyPromises);

      if (devices.length > 0) {
        return devices.sort((a, b) => a.name.localeCompare(b.name));
      }
    }

    console.log('[Registry] No TVs found via SSDP or subnet scan');
    return [];
  }

  /**
   * Generate a list of IPs to probe on the local /24 subnet.
   * Focuses on the most common DHCP-assigned range (1-50) for speed,
   * since TVs usually get low IPs from the router.
   */
  private generateSubnetIps(deviceIp: string): string[] {
    const parts = deviceIp.split('.');
    if (parts.length !== 4) { return []; }

    const subnet = `${parts[0]}.${parts[1]}.${parts[2]}`;
    const myLastOctet = parseInt(parts[3], 10);
    const ips: string[] = [];

    // Probe IPs 1-50 (most common DHCP range for home devices)
    // Skip our own IP and .255 (broadcast)
    for (let i = 1; i <= 50; i++) {
      if (i !== myLastOctet) {
        ips.push(`${subnet}.${i}`);
      }
    }

    return ips;
  }

  // ───────────────────────────────────────────
  // Connection Management
  // ───────────────────────────────────────────

  /** Connect to a TV device, automatically selecting the right handler. */
  async connect(device: TvDevice): Promise<void> {
    const handler = this.getHandler(device);
    if (!handler) {
      throw new Error(`No handler available for brand: ${device.brand}`);
    }

    // Disconnect any existing session first (silently, don't emit events)
    if (this.activeHandler) {
      try {
        await this.activeHandler.disconnect();
      } catch {}
      this.activeHandler = null;
      this.activeDevice = null;
      this.activeUnsubscribe?.();
      this.activeUnsubscribe = null;
    }

    this.activeHandler = handler;
    this.activeDevice = device;

    // Forward connection events from the handler to registry listeners
    const unsubscribe = handler.onConnectionStateChange((event) => {
      // Only forward if this handler is still the active one
      if (this.activeHandler !== handler) { return; }

      this.connectionListeners.forEach((listener) => {
        try { listener(event); } catch {}
      });

      // Update active state on disconnect
      if (event.state === 'disconnected') {
        this.activeHandler = null;
        this.activeDevice = null;
        this.activeUnsubscribe?.();
        this.activeUnsubscribe = null;
      }
    });

    this.activeUnsubscribe = unsubscribe;

    try {
      await handler.connect(device);
    } catch (err) {
      this.activeHandler = null;
      this.activeDevice = null;
      this.activeUnsubscribe?.();
      this.activeUnsubscribe = null;
      throw err;
    }
  }

  /** Disconnect the current session. */
  async disconnect(): Promise<void> {
    if (this.activeHandler) {
      try {
        await this.activeHandler.disconnect();
      } finally {
        this.activeHandler = null;
        this.activeDevice = null;
        this.activeUnsubscribe?.();
        this.activeUnsubscribe = null;
      }
    }
  }

  /** Whether any TV is currently connected. */
  isConnected(): boolean {
    return this.activeHandler?.isConnected() ?? false;
  }

  /** Get the currently connected device. */
  getActiveDevice(): TvDevice | null {
    return this.activeDevice;
  }

  /** Get the currently active handler. */
  getActiveHandler(): TvHandler | null {
    return this.activeHandler;
  }

  // ───────────────────────────────────────────
  // Remote Control
  // ───────────────────────────────────────────

  /** Send a standard remote key to the connected TV. */
  async sendKey(key: StandardRemoteKey): Promise<boolean> {
    if (!this.activeHandler) { return false; }
    return this.activeHandler.sendKey(key);
  }

  /** Send a raw key code (e.g. KEY_NETFLIX). No-op if handler does not support it. */
  async sendRawKey(key: string): Promise<boolean> {
    if (!this.activeHandler || typeof this.activeHandler.sendRawKey !== 'function') {
      return false;
    }
    return this.activeHandler.sendRawKey(key);
  }

  /** Launch app by ID (same as POC). No-op if handler does not support it. */
  async launchApp(appId: string): Promise<boolean> {
    if (!this.activeHandler || typeof this.activeHandler.launchApp !== 'function') {
      return false;
    }
    return this.activeHandler.launchApp(appId);
  }

  /** Get supported keys for the current handler. */
  getSupportedKeys(): StandardRemoteKey[] {
    return this.activeHandler?.getSupportedKeys() ?? [];
  }

  /** Get supported key groups for the current handler. */
  getSupportedKeyGroups(): RemoteKeyGroup[] {
    return this.activeHandler?.getSupportedKeyGroups() ?? [];
  }

  // ───────────────────────────────────────────
  // Events
  // ───────────────────────────────────────────

  /** Listen for connection state changes across all handlers. */
  onConnectionStateChange(listener: ConnectionListener): () => void {
    this.connectionListeners.add(listener);
    return () => { this.connectionListeners.delete(listener); };
  }

  // ───────────────────────────────────────────
  // Quick Reconnect
  // ───────────────────────────────────────────

  /** Get the last connected IP from any handler that supports persistence. */
  async getLastConnectedIp(): Promise<string | null> {
    for (const handler of this.handlers) {
      const ip = await handler.getLastConnectedIp();
      if (ip) { return ip; }
    }
    return null;
  }

  // ───────────────────────────────────────────
  // Internal: SSDP Discovery
  // ───────────────────────────────────────────

  private async getSsdpIps(): Promise<string[]> {
    // Use the Samsung native module's SSDP implementation.
    // It already sends both Samsung-specific and DIAL (universal) M-SEARCH,
    // so it discovers non-Samsung devices too.
    if (Platform.OS !== 'android' || !SamsungTvRemote) {
      return [];
    }
    try {
      return await SamsungTvRemote.discover();
    } catch {
      return [];
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Singleton registry instance with built-in handlers
// ─────────────────────────────────────────────────────────────

/** The global handler registry. Import and use this everywhere. */
export const registry = new HandlerRegistry();

// Auto-register built-in handlers
registry.register(new SamsungTizenHandler());

// ─────────────────────────────────────────────────────────────
// To add a new handler:
//   1. Create src/handlers/<brand>/<BrandHandler>.ts implementing TvHandler
//   2. Create src/handlers/<brand>/keys.ts with key mappings
//   3. Add registry.register(new YourHandler()) below
//   4. Add brand to TvBrand type in types.ts
//   5. Done — discovery and UI will automatically pick it up
// ─────────────────────────────────────────────────────────────
