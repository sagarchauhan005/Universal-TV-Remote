/**
 * Unit tests for Samsung Tizen handler.
 * Mocks fetch (REST identify) and NativeModules (connect/sendKey/launchApp).
 */

const mockFetch = jest.fn();
const mockSendKey = jest.fn().mockResolvedValue(true);
const mockLaunchApp = jest.fn().mockResolvedValue(true);
const mockConnect = jest.fn().mockResolvedValue(undefined);
const mockDisconnect = jest.fn().mockResolvedValue(undefined);

jest.mock('react-native', () => ({
  NativeModules: {
    SamsungTvRemote: {
      get connect() { return mockConnect; },
      get disconnect() { return mockDisconnect; },
      get sendKey() { return mockSendKey; },
      get launchApp() { return mockLaunchApp; },
    },
  },
  Platform: { OS: 'android' as const },
  NativeEventEmitter: jest.fn().mockImplementation(() => ({
    addListener: jest.fn().mockReturnValue({ remove: jest.fn() }),
  })),
}));

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = mockFetch;
  mockConnect.mockResolvedValue(undefined);
  mockDisconnect.mockResolvedValue(undefined);
  mockSendKey.mockResolvedValue(true);
  mockLaunchApp.mockResolvedValue(true);
});

import { SamsungTizenHandler } from '../../src/handlers/samsung/SamsungTizenHandler';
import { SAMSUNG_KEY_MAP } from '../../src/handlers/samsung/keys';

describe('SamsungTizenHandler', () => {
  const handler = new SamsungTizenHandler();

  describe('brand and displayName', () => {
    it('has brand samsung_tizen and displayName Samsung Tizen', () => {
      expect(handler.brand).toBe('samsung_tizen');
      expect(handler.displayName).toBe('Samsung Tizen');
    });
  });

  describe('identify', () => {
    it('returns TvDevice when REST returns Samsung SmartTV', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          device: {
            id: 'uuid-123',
            name: 'Living Room TV',
            modelName: 'UN55TU8000',
            type: 'Samsung SmartTV',
            OS: 'Tizen 6.0',
            resolution: '3840x2160',
            wifiMac: 'AA:BB:CC:DD:EE:FF',
          },
        }),
      });

      const device = await handler.identify('192.168.1.100');
      expect(device).not.toBeNull();
      expect(device!.ip).toBe('192.168.1.100');
      expect(device!.name).toBe('Living Room TV');
      expect(device!.brand).toBe('samsung_tizen');
      expect(device!.model).toBe('UN55TU8000');
      expect(device!.port).toBe(8002);
      expect(mockFetch).toHaveBeenCalledWith('http://192.168.1.100:8001/api/v2/', expect.any(Object));
    });

    it('returns null when REST response is not Samsung', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ device: { name: 'LG TV', type: 'LG' } }),
      });

      const device = await handler.identify('192.168.1.101');
      expect(device).toBeNull();
    });

    it('returns null when fetch fails', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const device = await handler.identify('192.168.1.102');
      expect(device).toBeNull();
    });

    it('returns null when response is not ok', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false });

      const device = await handler.identify('192.168.1.103');
      expect(device).toBeNull();
    });
  });

  describe('sendKey', () => {
    beforeEach(async () => {
      await handler.connect({
        id: 'test',
        ip: '192.168.1.10',
        name: 'Test TV',
        brand: 'samsung_tizen',
      });
    });

    it('maps standard key to Samsung code and calls native sendKey', async () => {
      await handler.sendKey('volume_up');
      expect(mockSendKey).toHaveBeenCalledWith('KEY_VOLUP');
    });

    it('maps power to KEY_POWER and home to KEY_HOME', async () => {
      await handler.sendKey('power');
      expect(mockSendKey).toHaveBeenCalledWith('KEY_POWER');
      mockSendKey.mockClear();
      await handler.sendKey('home');
      expect(mockSendKey).toHaveBeenCalledWith('KEY_HOME');
    });
  });

  describe('sendRawKey', () => {
    beforeEach(async () => {
      await handler.connect({
        id: 'test',
        ip: '192.168.1.10',
        name: 'Test TV',
        brand: 'samsung_tizen',
      });
    });

    it('calls native sendKey with raw key string', async () => {
      await handler.sendRawKey('KEY_NETFLIX');
      expect(mockSendKey).toHaveBeenCalledWith('KEY_NETFLIX');
    });
  });

  describe('launchApp', () => {
    beforeEach(async () => {
      await handler.connect({
        id: 'test',
        ip: '192.168.1.10',
        name: 'Test TV',
        brand: 'samsung_tizen',
      });
    });

    it('calls native launchApp with app ID', async () => {
      await handler.launchApp('111299001912');
      expect(mockLaunchApp).toHaveBeenCalledWith('111299001912');
    });
  });

  describe('getSupportedKeys and getSupportedKeyGroups', () => {
    it('getSupportedKeys returns all keys from SAMSUNG_KEY_MAP', () => {
      const keys = handler.getSupportedKeys();
      expect(keys.length).toBe(Object.keys(SAMSUNG_KEY_MAP).length);
      expect(keys).toContain('power');
      expect(keys).toContain('volume_up');
      expect(keys).toContain('num_0');
    });

    it('getSupportedKeyGroups returns expected groups', () => {
      const groups = handler.getSupportedKeyGroups();
      expect(groups).toContain('power');
      expect(groups).toContain('navigation');
      expect(groups).toContain('volume');
      expect(groups).toContain('media');
    });
  });
});
