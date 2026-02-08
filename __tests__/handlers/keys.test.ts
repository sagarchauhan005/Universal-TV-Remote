/**
 * Unit tests for Samsung Tizen key mappings.
 */

import type { StandardRemoteKey, RemoteKeyGroup } from '../../src/handlers/types';
import {
  SAMSUNG_KEY_MAP,
  SAMSUNG_SUPPORTED_KEYS,
  SAMSUNG_SUPPORTED_GROUPS,
} from '../../src/handlers/samsung/keys';

const ALL_STANDARD_KEYS: StandardRemoteKey[] = [
  'power', 'source',
  'up', 'down', 'left', 'right', 'enter', 'back',
  'home', 'menu', 'info',
  'volume_up', 'volume_down', 'mute',
  'channel_up', 'channel_down',
  'num_0', 'num_1', 'num_2', 'num_3', 'num_4',
  'num_5', 'num_6', 'num_7', 'num_8', 'num_9',
  'play', 'pause', 'stop', 'rewind', 'fast_forward',
];

const ALL_GROUPS: RemoteKeyGroup[] = [
  'power', 'navigation', 'volume', 'channels', 'numbers', 'media', 'menu',
];

describe('Samsung keys', () => {
  describe('SAMSUNG_KEY_MAP', () => {
    it('has an entry for every StandardRemoteKey', () => {
      for (const key of ALL_STANDARD_KEYS) {
        expect(SAMSUNG_KEY_MAP[key]).toBeDefined();
        expect(typeof SAMSUNG_KEY_MAP[key]).toBe('string');
      }
    });

    it('maps each key to a KEY_* string', () => {
      for (const key of ALL_STANDARD_KEYS) {
        const code = SAMSUNG_KEY_MAP[key];
        expect(code).toMatch(/^KEY_[A-Z0-9]+$/);
      }
    });

    it('has no extra keys beyond StandardRemoteKey', () => {
      const mapKeys = Object.keys(SAMSUNG_KEY_MAP) as StandardRemoteKey[];
      expect(mapKeys.sort()).toEqual([...ALL_STANDARD_KEYS].sort());
    });

    it('maps power to KEY_POWER and volume_up to KEY_VOLUP', () => {
      expect(SAMSUNG_KEY_MAP.power).toBe('KEY_POWER');
      expect(SAMSUNG_KEY_MAP.volume_up).toBe('KEY_VOLUP');
    });

    it('maps number pad to KEY_0 through KEY_9', () => {
      for (let i = 0; i <= 9; i++) {
        expect(SAMSUNG_KEY_MAP[`num_${i}` as StandardRemoteKey]).toBe(`KEY_${i}`);
      }
    });
  });

  describe('SAMSUNG_SUPPORTED_KEYS', () => {
    it('contains all standard keys', () => {
      expect(SAMSUNG_SUPPORTED_KEYS.length).toBe(ALL_STANDARD_KEYS.length);
      for (const key of ALL_STANDARD_KEYS) {
        expect(SAMSUNG_SUPPORTED_KEYS).toContain(key);
      }
    });

    it('matches keys in SAMSUNG_KEY_MAP', () => {
      expect([...SAMSUNG_SUPPORTED_KEYS].sort()).toEqual(
        Object.keys(SAMSUNG_KEY_MAP).sort()
      );
    });
  });

  describe('SAMSUNG_SUPPORTED_GROUPS', () => {
    it('contains all expected key groups', () => {
      for (const group of ALL_GROUPS) {
        expect(SAMSUNG_SUPPORTED_GROUPS).toContain(group);
      }
    });

    it('has no duplicate or invalid groups', () => {
      expect(SAMSUNG_SUPPORTED_GROUPS.length).toBe(ALL_GROUPS.length);
      expect([...new Set(SAMSUNG_SUPPORTED_GROUPS)].sort()).toEqual(
        [...ALL_GROUPS].sort()
      );
    });
  });
});
