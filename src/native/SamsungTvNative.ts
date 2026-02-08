import { NativeModules, NativeEventEmitter, Platform } from 'react-native';

const { SamsungTvRemote } = NativeModules;

export type ConnectionEvent = 'connected' | 'disconnected' | 'error' | 'discoveryError';

export interface NetworkInfo {
  ip: string;
  ssid: string;
}

export interface SamsungTvNativeModule {
  discover: () => Promise<string[]>;
  connect: (ip: string) => Promise<void>;
  disconnect: () => Promise<void>;
  sendKey: (key: string) => Promise<boolean>;
  isConnected: () => Promise<boolean>;
  getLastConnectedIp: () => Promise<string | null>;
  getNetworkInfo: () => Promise<NetworkInfo>;
}

export const SamsungTv: SamsungTvNativeModule | null =
  Platform.OS === 'android' ? SamsungTvRemote : null;

export const addConnectionListener = (
  callback: (event: ConnectionEvent, data?: { ip?: string; error?: string }) => void
) => {
  if (Platform.OS !== 'android' || !SamsungTvRemote) return () => {};
  const emitter = new NativeEventEmitter(SamsungTvRemote);
  const sub = emitter.addListener('connected', (data) => callback('connected', data));
  const sub2 = emitter.addListener('disconnected', () => callback('disconnected'));
  const sub3 = emitter.addListener('error', (data) => callback('error', data));
  const sub4 = emitter.addListener('discoveryError', (data) => callback('discoveryError', data));
  return () => {
    sub.remove();
    sub2.remove();
    sub3.remove();
    sub4.remove();
  };
};
