/**
 * ╔══════════════════════════════════════════════════════════╗
 * ║  TV Handler Template — Copy this to add a new TV brand  ║
 * ╚══════════════════════════════════════════════════════════╝
 *
 * Steps to add a new TV brand:
 *
 *   1. Copy this folder to `src/handlers/<your_brand>/`
 *   2. Rename this file to `<YourBrand>Handler.ts`
 *   3. Create a `keys.ts` file with key mappings (see samsung/keys.ts)
 *   4. Implement all methods below
 *   5. Add your brand to the `TvBrand` type in `src/handlers/types.ts`
 *   6. Register your handler in `src/handlers/registry.ts`:
 *        import { YourBrandHandler } from './<your_brand>/<YourBrand>Handler';
 *        registry.register(new YourBrandHandler());
 *   7. That's it — discovery, connection, and UI will pick it up automatically.
 *
 * Tips:
 *   - The `identify()` method is crucial. It must reliably detect your brand
 *     by probing the device (e.g., hitting a known REST endpoint).
 *   - If the TV protocol can be done over HTTP/WebSocket from JS, you can
 *     implement everything in this file without native modules.
 *   - If you need native code (e.g., for TLS with self-signed certs, or binary
 *     protocols), add a native module and call it from here.
 *   - See SamsungTizenHandler.ts for a real-world example.
 *
 * Known protocols for popular brands:
 *   - LG WebOS:     SSAP over WebSocket on port 3000/3001
 *   - Roku:         ECP (HTTP REST) on port 8060
 *   - Android TV:   gRPC/Protobuf over TLS on port 6466
 *   - Vizio:        REST API with auth on port 7345/9000
 *   - Fire TV:      ADB-based on port 5555
 */

import type {
  TvHandler,
  TvDevice,
  TvBrand,
  StandardRemoteKey,
  RemoteKeyGroup,
  ConnectionListener,
  ConnectionEvent,
} from '../types';

// ────────────────────────────────────────────────────────────
// Key Mappings — Move these to a separate keys.ts file
// ────────────────────────────────────────────────────────────

const KEY_MAP: Partial<Record<StandardRemoteKey, string>> = {
  // Map StandardRemoteKey → your brand's native key code
  // Example for Roku ECP:
  //   power: 'Power',
  //   up: 'Up',
  //   down: 'Down',
  //   volume_up: 'VolumeUp',
  //   ...
};

const SUPPORTED_KEYS: StandardRemoteKey[] = Object.keys(KEY_MAP) as StandardRemoteKey[];

const SUPPORTED_GROUPS: RemoteKeyGroup[] = [
  // List which key groups your handler supports:
  // 'power', 'navigation', 'volume', 'channels', 'numbers', 'media', 'menu'
];

// ────────────────────────────────────────────────────────────
// Handler Implementation
// ────────────────────────────────────────────────────────────

export class TemplateHandler implements TvHandler {
  readonly brand: TvBrand = 'unknown'; // ← Change to your brand
  readonly displayName = 'Template Brand'; // ← Human-readable name

  private listeners: Set<ConnectionListener> = new Set();
  private connected = false;

  async identify(ip: string, _ssdpResponse?: string): Promise<TvDevice | null> {
    // Probe the device to see if it matches your brand.
    // Example for Roku:
    //   const resp = await fetch(`http://${ip}:8060/query/device-info`);
    //   const xml = await resp.text();
    //   if (xml.includes('<device-info>')) { return { ... }; }
    //   return null;
    //
    // Return null if this IP is NOT your brand.
    return null;
  }

  async connect(_device: TvDevice): Promise<void> {
    // Establish connection to the TV.
    // Emit state changes as you progress:
    //   this.emit({ state: 'connecting', device });
    //   ... connect logic ...
    //   this.emit({ state: 'connected', device });
    throw new Error('Not implemented');
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.emit({ state: 'disconnected' });
  }

  isConnected(): boolean {
    return this.connected;
  }

  async sendKey(key: StandardRemoteKey): Promise<boolean> {
    const nativeKey = KEY_MAP[key];
    if (!nativeKey) { return false; }
    // Send the key to the TV using your protocol.
    // Example for Roku ECP:
    //   await fetch(`http://${ip}:8060/keypress/${nativeKey}`, { method: 'POST' });
    //   return true;
    return false;
  }

  getSupportedKeys(): StandardRemoteKey[] {
    return SUPPORTED_KEYS;
  }

  getSupportedKeyGroups(): RemoteKeyGroup[] {
    return SUPPORTED_GROUPS;
  }

  onConnectionStateChange(listener: ConnectionListener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  async getLastConnectedIp(): Promise<string | null> {
    // Implement persistence if needed (AsyncStorage, SharedPreferences, etc.)
    return null;
  }

  private emit(event: ConnectionEvent) {
    this.listeners.forEach((l) => { try { l(event); } catch {} });
  }
}
