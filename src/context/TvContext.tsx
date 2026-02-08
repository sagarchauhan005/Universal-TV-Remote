/**
 * TvContext — Global state for TV discovery, connection, and remote control.
 *
 * Uses the handler registry to automatically select the right protocol
 * for each discovered TV brand. The UI never needs to know which protocol
 * is being used — it just calls `connect(device)` and `sendKey('volume_up')`.
 */

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  registry,
  type TvDevice,
  type ConnectionState,
  type StandardRemoteKey,
  type RemoteKeyGroup,
} from '../handlers';

interface TvContextValue {
  // Discovery
  discoveredDevices: TvDevice[];
  isDiscovering: boolean;
  discover: () => Promise<void>;

  // Connection
  connectionState: ConnectionState;
  connectedDevice: TvDevice | null;
  lastConnectedIp: string | null;
  connect: (device: TvDevice) => Promise<void>;
  disconnect: () => Promise<void>;

  // Remote control
  sendKey: (key: StandardRemoteKey) => Promise<void>;
  supportedKeys: StandardRemoteKey[];
  supportedKeyGroups: RemoteKeyGroup[];

  // Errors
  errorMessage: string | null;
}

const TvContext = createContext<TvContextValue | null>(null);

export function TvProvider({ children }: { children: React.ReactNode }) {
  // Discovery state
  const [discoveredDevices, setDiscoveredDevices] = useState<TvDevice[]>([]);
  const [isDiscovering, setIsDiscovering] = useState(false);

  // Connection state
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [connectedDevice, setConnectedDevice] = useState<TvDevice | null>(null);
  const [lastConnectedIp, setLastConnectedIp] = useState<string | null>(null);

  // Remote capabilities (updated when handler changes)
  const [supportedKeys, setSupportedKeys] = useState<StandardRemoteKey[]>([]);
  const [supportedKeyGroups, setSupportedKeyGroups] = useState<RemoteKeyGroup[]>([]);

  // Error state
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Cleanup ref for connection listener
  const unsubscribeRef = useRef<(() => void) | null>(null);

  // ───────────────────────────────────────────
  // Initialize: load last connected IP
  // ───────────────────────────────────────────
  useEffect(() => {
    registry.getLastConnectedIp().then(setLastConnectedIp);
  }, []);

  // ───────────────────────────────────────────
  // Discovery
  // ───────────────────────────────────────────
  const discover = useCallback(async () => {
    setIsDiscovering(true);
    setErrorMessage(null);

    try {
      const devices = await registry.discoverAll();
      setDiscoveredDevices(devices);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Discovery failed');
      setDiscoveredDevices([]);
    } finally {
      setIsDiscovering(false);
    }
  }, []);

  // ───────────────────────────────────────────
  // Connection
  // ───────────────────────────────────────────
  const connect = useCallback(async (device: TvDevice) => {
    setConnectionState('connecting');
    setConnectedDevice(device);
    setErrorMessage(null);

    // Clean up previous listener
    unsubscribeRef.current?.();

    // Listen for connection state changes from the handler
    unsubscribeRef.current = registry.onConnectionStateChange((event) => {
      setConnectionState(event.state);

      if (event.state === 'connected') {
        setConnectedDevice(event.device || device);
        setErrorMessage(null);
        // Update capabilities from the active handler
        setSupportedKeys(registry.getSupportedKeys());
        setSupportedKeyGroups(registry.getSupportedKeyGroups());
        // Refresh last connected IP
        registry.getLastConnectedIp().then(setLastConnectedIp);
      } else if (event.state === 'disconnected') {
        setConnectedDevice(null);
        setSupportedKeys([]);
        setSupportedKeyGroups([]);
      } else if (event.state === 'error') {
        setErrorMessage(event.error || 'Connection error');
      }
    });

    try {
      await registry.connect(device);

      // Pre-populate supported keys so RemoteScreen is ready when 'connected' fires.
      // The handler is already set in the registry at this point.
      const keys = registry.getSupportedKeys();
      const groups = registry.getSupportedKeyGroups();
      if (keys.length > 0) { setSupportedKeys(keys); }
      if (groups.length > 0) { setSupportedKeyGroups(groups); }
    } catch (err: any) {
      setConnectionState('error');
      setErrorMessage(err?.message || 'Connection failed');
    }
  }, []);

  // ───────────────────────────────────────────
  // Disconnect
  // ───────────────────────────────────────────
  const disconnect = useCallback(async () => {
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;

    await registry.disconnect();

    setConnectionState('disconnected');
    setConnectedDevice(null);
    setErrorMessage(null);
    setSupportedKeys([]);
    setSupportedKeyGroups([]);
  }, []);

  // ───────────────────────────────────────────
  // Remote Control
  // ───────────────────────────────────────────
  const sendKey = useCallback(async (key: StandardRemoteKey) => {
    try {
      await registry.sendKey(key);
    } catch (err: any) {
      console.warn(`[TvContext] sendKey(${key}) failed:`, err?.message);
    }
  }, []);

  // ───────────────────────────────────────────
  // Cleanup on unmount
  // ───────────────────────────────────────────
  useEffect(() => {
    return () => {
      unsubscribeRef.current?.();
    };
  }, []);

  const value: TvContextValue = {
    discoveredDevices,
    isDiscovering,
    discover,
    connectionState,
    connectedDevice,
    lastConnectedIp,
    connect,
    disconnect,
    sendKey,
    supportedKeys,
    supportedKeyGroups,
    errorMessage,
  };

  return <TvContext.Provider value={value}>{children}</TvContext.Provider>;
}

export function useTv() {
  const ctx = useContext(TvContext);
  if (!ctx) { throw new Error('useTv must be used within TvProvider'); }
  return ctx;
}
