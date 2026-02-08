/**
 * Core type definitions for the Universal TV Remote handler system.
 *
 * Every TV brand handler implements the `TvHandler` interface.
 * The registry auto-selects the right handler based on discovered devices.
 *
 * To add support for a new TV brand, implement `TvHandler` and register it.
 * See `src/handlers/_template/TemplateHandler.ts` for a starting point.
 */

// ─────────────────────────────────────────────────────────────
// TV Brands
// ─────────────────────────────────────────────────────────────

/** Supported TV brands. Add new brands here when implementing a handler. */
export type TvBrand =
  | 'samsung_tizen'  // Samsung Smart TVs (2016+, Tizen OS)
  | 'lg_webos'       // LG Smart TVs (WebOS)
  | 'roku'           // Roku TVs & devices
  | 'android_tv'     // Android TV (Sony, TCL, Xiaomi, Philips, etc.)
  | 'vizio'          // Vizio SmartCast TVs
  | 'fire_tv'        // Amazon Fire TV
  | 'unknown';       // Identified on network but brand not recognized

// ─────────────────────────────────────────────────────────────
// Device
// ─────────────────────────────────────────────────────────────

/** Represents a TV discovered on the network. */
export interface TvDevice {
  /** Unique ID (typically UUID from SSDP or generated from IP). */
  id: string;
  /** IP address on the local network. */
  ip: string;
  /** Human-readable name (e.g. "[TV] Samsung 5 Series (49)"). */
  name: string;
  /** Detected brand. */
  brand: TvBrand;
  /** Model name if available (e.g. "UA49N5370"). */
  model?: string;
  /** Operating system if available (e.g. "Tizen", "WebOS 6.0"). */
  os?: string;
  /** Resolution if available (e.g. "1920x1080"). */
  resolution?: string;
  /** MAC address if available. */
  mac?: string;
  /** Port used for the remote control protocol. */
  port?: number;
  /** Raw SSDP response string (useful for debugging). */
  ssdpResponse?: string;
  /** Any additional brand-specific metadata. */
  metadata?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────
// Connection
// ─────────────────────────────────────────────────────────────

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface ConnectionEvent {
  state: ConnectionState;
  device?: TvDevice;
  error?: string;
}

export type ConnectionListener = (event: ConnectionEvent) => void;

// ─────────────────────────────────────────────────────────────
// Remote Keys (standard across all brands)
// ─────────────────────────────────────────────────────────────

/**
 * Standard remote keys that should work across all TV brands.
 * Each handler maps these to brand-specific key codes.
 */
export type StandardRemoteKey =
  // Power & input
  | 'power'
  | 'source'
  // Navigation
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'enter'
  | 'back'
  // Menu
  | 'home'
  | 'menu'
  | 'info'
  // Volume
  | 'volume_up'
  | 'volume_down'
  | 'mute'
  // Channels
  | 'channel_up'
  | 'channel_down'
  // Number pad
  | 'num_0' | 'num_1' | 'num_2' | 'num_3' | 'num_4'
  | 'num_5' | 'num_6' | 'num_7' | 'num_8' | 'num_9'
  // Media transport
  | 'play'
  | 'pause'
  | 'stop'
  | 'rewind'
  | 'fast_forward';

/**
 * Grouping of keys for UI layout.
 * Handlers report which groups they support.
 */
export type RemoteKeyGroup =
  | 'power'
  | 'navigation'
  | 'volume'
  | 'channels'
  | 'numbers'
  | 'media'
  | 'menu';

/** Maps key groups to the keys they contain. */
export const KEY_GROUPS: Record<RemoteKeyGroup, StandardRemoteKey[]> = {
  power: ['power', 'source'],
  navigation: ['up', 'down', 'left', 'right', 'enter', 'back'],
  volume: ['volume_up', 'volume_down', 'mute'],
  channels: ['channel_up', 'channel_down'],
  numbers: [
    'num_0', 'num_1', 'num_2', 'num_3', 'num_4',
    'num_5', 'num_6', 'num_7', 'num_8', 'num_9',
  ],
  media: ['play', 'pause', 'stop', 'rewind', 'fast_forward'],
  menu: ['home', 'menu', 'info'],
};

// ─────────────────────────────────────────────────────────────
// Handler Interface
// ─────────────────────────────────────────────────────────────

/**
 * The core interface every TV brand handler must implement.
 *
 * Lifecycle:
 *   1. `identify(ip, ssdpResponse?)` — called during discovery to check if
 *      this handler recognizes the device at the given IP.
 *   2. `connect(device)` — establish a control session.
 *   3. `sendKey(key)` — send remote commands.
 *   4. `disconnect()` — tear down the session.
 */
export interface TvHandler {
  /** Brand identifier. */
  readonly brand: TvBrand;

  /** Human-readable brand name for UI (e.g. "Samsung Tizen"). */
  readonly displayName: string;

  /**
   * Attempt to identify a device at the given IP.
   * Return a TvDevice if this handler recognizes it, or null otherwise.
   * Called during network scan for every discovered IP.
   *
   * @param ip - The IP address found via SSDP or network scan.
   * @param ssdpResponse - Raw SSDP response string if available.
   */
  identify(ip: string, ssdpResponse?: string): Promise<TvDevice | null>;

  /**
   * Connect to a TV and start a control session.
   * Should emit connection state changes via the listener.
   */
  connect(device: TvDevice): Promise<void>;

  /** Disconnect the current session. */
  disconnect(): Promise<void>;

  /** Whether a session is currently active. */
  isConnected(): boolean;

  /**
   * Send a standard remote key to the TV.
   * The handler maps it to the brand-specific key code internally.
   * Returns true if the command was sent successfully.
   */
  sendKey(key: StandardRemoteKey): Promise<boolean>;

  /**
   * Send a raw key code to the TV (e.g. KEY_NETFLIX, KEY_APP_LIST).
   * Optional; only Samsung and other handlers that support app shortcuts implement this.
   */
  sendRawKey?(key: string): Promise<boolean>;

  /**
   * Launch app by Tizen app ID (ed.apps.launch). Same as POC. Optional.
   */
  launchApp?(appId: string): Promise<boolean>;

  /** Returns the list of standard keys this handler supports. */
  getSupportedKeys(): StandardRemoteKey[];

  /** Returns the key groups this handler supports (for UI layout). */
  getSupportedKeyGroups(): RemoteKeyGroup[];

  /** Register a listener for connection state changes. Returns an unsubscribe function. */
  onConnectionStateChange(listener: ConnectionListener): () => void;

  /** Get the last connected device IP (for quick-reconnect). */
  getLastConnectedIp(): Promise<string | null>;
}
