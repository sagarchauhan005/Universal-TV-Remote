/**
 * Samsung Tizen key mappings.
 * Maps standard remote keys to Samsung-specific key codes
 * used in the `ms.remote.control` WebSocket protocol.
 */

import type { StandardRemoteKey, RemoteKeyGroup } from '../types';

/**
 * Map from StandardRemoteKey → Samsung key code string.
 * These codes are sent as `DataOfCmd` in the WebSocket payload.
 */
export const SAMSUNG_KEY_MAP: Record<StandardRemoteKey, string> = {
  // Power & input
  power: 'KEY_POWER',
  source: 'KEY_SOURCE',

  // Navigation
  up: 'KEY_UP',
  down: 'KEY_DOWN',
  left: 'KEY_LEFT',
  right: 'KEY_RIGHT',
  enter: 'KEY_ENTER',
  back: 'KEY_RETURN',

  // Menu
  home: 'KEY_HOME',
  menu: 'KEY_MENU',
  info: 'KEY_INFO',

  // Volume
  volume_up: 'KEY_VOLUP',
  volume_down: 'KEY_VOLDOWN',
  mute: 'KEY_MUTE',

  // Channels
  channel_up: 'KEY_CHUP',
  channel_down: 'KEY_CHDOWN',

  // Number pad
  num_0: 'KEY_0',
  num_1: 'KEY_1',
  num_2: 'KEY_2',
  num_3: 'KEY_3',
  num_4: 'KEY_4',
  num_5: 'KEY_5',
  num_6: 'KEY_6',
  num_7: 'KEY_7',
  num_8: 'KEY_8',
  num_9: 'KEY_9',

  // Media transport
  play: 'KEY_PLAY',
  pause: 'KEY_PAUSE',
  stop: 'KEY_STOP',
  rewind: 'KEY_REWIND',
  fast_forward: 'KEY_FF',
};

/** Samsung supports all key groups. */
export const SAMSUNG_SUPPORTED_GROUPS: RemoteKeyGroup[] = [
  'power',
  'navigation',
  'volume',
  'channels',
  'numbers',
  'media',
  'menu',
];

/** All standard keys are supported by Samsung. */
export const SAMSUNG_SUPPORTED_KEYS: StandardRemoteKey[] =
  Object.keys(SAMSUNG_KEY_MAP) as StandardRemoteKey[];

// ─────────────────────────────────────────────────────────────
// Raw keys for app shortcuts and keyboard input
// ─────────────────────────────────────────────────────────────

/** Samsung raw key code (e.g. KEY_NETFLIX, KEY_A). */
export type SamsungKey = string;

/**
 * Map a single character to a Samsung key code for on-screen keyboard/search.
 * Returns null if the character is not supported.
 * Used to type in TV app UIs (Netflix, YouTube search, etc.).
 */
export function charToSamsungKey(ch: string): SamsungKey | null {
  if (ch.length !== 1) return null;
  const c = ch.toUpperCase();
  if (c >= 'A' && c <= 'Z') return `KEY_${c}`;
  if (ch >= '0' && ch <= '9') return `KEY_${ch}`;
  if (ch === ' ') return 'KEY_SPACE';
  return null;
}
