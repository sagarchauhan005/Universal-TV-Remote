/**
 * Samsung Tizen TV Handler
 *
 * Supports Samsung Smart TVs running Tizen OS (2016+ / K-series onward).
 * Uses the Samsung WebSocket remote control protocol on port 8002 (wss) or 8001 (ws).
 *
 * Protocol:
 *   - Discovery: SSDP multicast + REST probe at http://<ip>:8001/api/v2/
 *   - Connection: wss://<ip>:8002/api/v2/channels/samsung.remote.control
 *   - Commands:  JSON payload with method "ms.remote.control"
 *   - Auth:      Token-based (TV prompts on first connect, token reused after)
 *
 * This handler wraps the existing Android native module `SamsungTvRemote`
 * which handles SSL (self-signed certs) and WebSocket communication.
 */

import { NativeModules, NativeEventEmitter, Platform } from 'react-native';
import type {
  TvHandler,
  TvDevice,
  TvBrand,
  StandardRemoteKey,
  RemoteKeyGroup,
  ConnectionListener,
  ConnectionEvent,
} from '../types';
import { SAMSUNG_KEY_MAP, SAMSUNG_SUPPORTED_KEYS, SAMSUNG_SUPPORTED_GROUPS } from './keys';

const { SamsungTvRemote } = NativeModules;

/** REST API info endpoint (non-secure, always port 8001). */
const INFO_URL = (ip: string) => `http://${ip}:8001/api/v2/`;

/** Timeout for REST probe during identification (ms). Short for fast subnet scanning. */
const IDENTIFY_TIMEOUT_MS = 2500;

export class SamsungTizenHandler implements TvHandler {
  readonly brand: TvBrand = 'samsung_tizen';
  readonly displayName = 'Samsung Tizen';

  private connectedDevice: TvDevice | null = null;
  private listeners: Set<ConnectionListener> = new Set();

  // ───────────────────────────────────────────
  // Identification
  // ───────────────────────────────────────────

  async identify(ip: string, _ssdpResponse?: string): Promise<TvDevice | null> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), IDENTIFY_TIMEOUT_MS);

      const response = await fetch(INFO_URL(ip), { signal: controller.signal });
      clearTimeout(timeout);

      if (!response.ok) { return null; }

      const data = await response.json();
      const device = data?.device;

      // Verify it's actually a Samsung TV
      const isSamsung =
        device?.type === 'Samsung SmartTV' ||
        (typeof device?.name === 'string' && device.name.toLowerCase().includes('samsung')) ||
        (typeof data?.type === 'string' && data.type.toLowerCase().includes('samsung'));

      if (!isSamsung) { return null; }

      return {
        id: device?.id || device?.duid || `samsung-${ip}`,
        ip,
        name: device?.name || 'Samsung TV',
        brand: 'samsung_tizen',
        model: device?.modelName || device?.model,
        os: device?.OS || 'Tizen',
        resolution: device?.resolution,
        mac: device?.wifiMac,
        port: 8002,
        metadata: {
          firmwareVersion: device?.firmwareVersion,
          tokenAuthSupport: device?.TokenAuthSupport,
          networkType: device?.networkType,
          frameTVSupport: device?.FrameTVSupport,
          gamePadSupport: device?.GamePadSupport,
          apiVersion: data?.version,
        },
      };
    } catch {
      return null;
    }
  }

  // ───────────────────────────────────────────
  // Connection
  // ───────────────────────────────────────────

  async connect(device: TvDevice): Promise<void> {
    if (Platform.OS !== 'android' || !SamsungTvRemote) {
      throw new Error('Samsung TV control is only available on Android');
    }

    this.connectedDevice = device;
    this.emit({ state: 'connecting', device });

    // Set up native event listeners
    this.setupNativeListeners(device);

    try {
      await SamsungTvRemote.connect(device.ip);
    } catch (err: any) {
      this.connectedDevice = null;
      this.emit({ state: 'error', device, error: err?.message || 'Connection failed' });
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    if (Platform.OS !== 'android' || !SamsungTvRemote) { return; }
    try {
      await SamsungTvRemote.disconnect();
    } finally {
      this.connectedDevice = null;
      this.emit({ state: 'disconnected' });
    }
  }

  isConnected(): boolean {
    return this.connectedDevice !== null;
  }

  // ───────────────────────────────────────────
  // Remote Control
  // ───────────────────────────────────────────

  async sendKey(key: StandardRemoteKey): Promise<boolean> {
    if (Platform.OS !== 'android' || !SamsungTvRemote) { return false; }

    const samsungKey = SAMSUNG_KEY_MAP[key];
    if (!samsungKey) { return false; }

    try {
      return await SamsungTvRemote.sendKey(samsungKey);
    } catch {
      return false;
    }
  }

  getSupportedKeys(): StandardRemoteKey[] {
    return SAMSUNG_SUPPORTED_KEYS;
  }

  getSupportedKeyGroups(): RemoteKeyGroup[] {
    return SAMSUNG_SUPPORTED_GROUPS;
  }

  // ───────────────────────────────────────────
  // Event Listeners
  // ───────────────────────────────────────────

  onConnectionStateChange(listener: ConnectionListener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  async getLastConnectedIp(): Promise<string | null> {
    if (Platform.OS !== 'android' || !SamsungTvRemote) { return null; }
    try {
      return await SamsungTvRemote.getLastConnectedIp();
    } catch {
      return null;
    }
  }

  // ───────────────────────────────────────────
  // Discovery (via native module SSDP)
  // ───────────────────────────────────────────

  /** Run SSDP discovery via the native module. Returns raw IPs. */
  async discoverIps(): Promise<string[]> {
    if (Platform.OS !== 'android' || !SamsungTvRemote) { return []; }
    try {
      return await SamsungTvRemote.discover();
    } catch {
      return [];
    }
  }

  // ───────────────────────────────────────────
  // Internal helpers
  // ───────────────────────────────────────────

  private nativeListenerCleanup: (() => void) | null = null;

  private setupNativeListeners(device: TvDevice) {
    // Clean up any previous listeners
    this.nativeListenerCleanup?.();

    if (Platform.OS !== 'android' || !SamsungTvRemote) { return; }

    const emitter = new NativeEventEmitter(SamsungTvRemote);

    const subConnected = emitter.addListener('connected', (data) => {
      this.connectedDevice = device;
      this.emit({ state: 'connected', device: { ...device, ip: data?.ip || device.ip } });
    });

    const subDisconnected = emitter.addListener('disconnected', () => {
      this.connectedDevice = null;
      this.emit({ state: 'disconnected' });
    });

    const subError = emitter.addListener('error', (data) => {
      this.connectedDevice = null;
      this.emit({ state: 'error', device, error: data?.error || 'Unknown error' });
    });

    const subDiscoveryError = emitter.addListener('discoveryError', (data) => {
      // Discovery errors don't affect connection state
      console.warn('[SamsungHandler] Discovery error:', data?.error);
    });

    this.nativeListenerCleanup = () => {
      subConnected.remove();
      subDisconnected.remove();
      subError.remove();
      subDiscoveryError.remove();
    };
  }

  private emit(event: ConnectionEvent) {
    this.listeners.forEach((listener) => {
      try { listener(event); } catch {}
    });
  }
}
