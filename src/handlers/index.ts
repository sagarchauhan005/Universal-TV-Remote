/**
 * Public API for the handler system.
 * Import everything from here rather than reaching into subfolders.
 */

export { registry } from './registry';
export type {
  TvHandler,
  TvDevice,
  TvBrand,
  StandardRemoteKey,
  RemoteKeyGroup,
  ConnectionState,
  ConnectionEvent,
  ConnectionListener,
} from './types';
export { KEY_GROUPS } from './types';
export { SamsungTizenHandler } from './samsung/SamsungTizenHandler';
