/**
 * Unit tests for the handler registry.
 * Uses an isolated HandlerRegistry instance (no auto-registered handlers).
 */

import type { TvHandler, TvDevice, StandardRemoteKey, RemoteKeyGroup, ConnectionListener } from '../../src/handlers/types';
import { HandlerRegistry } from '../../src/handlers/registry';

function createMockHandler(overrides: Partial<TvHandler> = {}): TvHandler {
  return {
    brand: 'samsung_tizen',
    displayName: 'Samsung Tizen',
    identify: jest.fn().mockResolvedValue(null),
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    sendKey: jest.fn().mockResolvedValue(true),
    sendRawKey: jest.fn().mockResolvedValue(true),
    launchApp: jest.fn().mockResolvedValue(true),
    getSupportedKeys: jest.fn().mockReturnValue(['power', 'volume_up'] as StandardRemoteKey[]),
    getSupportedKeyGroups: jest.fn().mockReturnValue(['power', 'volume'] as RemoteKeyGroup[]),
    onConnectionStateChange: jest.fn().mockReturnValue(() => {}),
    getLastConnectedIp: jest.fn().mockResolvedValue(null),
    isConnected: jest.fn().mockReturnValue(false),
    ...overrides,
  };
}

function createDevice(overrides: Partial<TvDevice> = {}): TvDevice {
  return {
    id: 'test-1',
    ip: '192.168.1.10',
    name: 'Test Samsung TV',
    brand: 'samsung_tizen',
    ...overrides,
  };
}

describe('HandlerRegistry', () => {
  let registry: HandlerRegistry;

  beforeEach(() => {
    registry = new HandlerRegistry();
  });

  describe('registration', () => {
    it('registers a handler and returns it via getRegisteredHandlers', () => {
      const handler = createMockHandler();
      registry.register(handler);
      expect(registry.getRegisteredHandlers()).toContain(handler);
      expect(registry.getRegisteredHandlers().length).toBe(1);
    });

    it('getHandlerByBrand returns the handler for a registered brand', () => {
      const handler = createMockHandler();
      registry.register(handler);
      expect(registry.getHandlerByBrand('samsung_tizen')).toBe(handler);
      expect(registry.getHandlerByBrand('roku')).toBeUndefined();
    });

    it('getHandler returns the handler for a device with matching brand', () => {
      const handler = createMockHandler();
      registry.register(handler);
      const device = createDevice({ brand: 'samsung_tizen' });
      expect(registry.getHandler(device)).toBe(handler);
    });

    it('does not register the same brand twice', () => {
      const h1 = createMockHandler();
      const h2 = createMockHandler({ displayName: 'Other' });
      registry.register(h1);
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      registry.register(h2);
      expect(registry.getRegisteredHandlers().length).toBe(1);
      expect(registry.getHandlerByBrand('samsung_tizen')).toBe(h1);
      warnSpy.mockRestore();
    });
  });

  describe('remote control without active connection', () => {
    it('sendKey returns false when no handler is connected', async () => {
      const result = await registry.sendKey('volume_up');
      expect(result).toBe(false);
    });

    it('sendRawKey returns false when no handler is connected', async () => {
      const result = await registry.sendRawKey('KEY_NETFLIX');
      expect(result).toBe(false);
    });

    it('launchApp returns false when no handler is connected', async () => {
      const result = await registry.launchApp('111299001912');
      expect(result).toBe(false);
    });

    it('getSupportedKeys returns empty array when no handler', () => {
      expect(registry.getSupportedKeys()).toEqual([]);
    });

    it('getSupportedKeyGroups returns empty array when no handler', () => {
      expect(registry.getSupportedKeyGroups()).toEqual([]);
    });
  });

  describe('connect and remote control', () => {
    it('connect throws if no handler for device brand', async () => {
      const device = createDevice({ brand: 'samsung_tizen' });
      await expect(registry.connect(device)).rejects.toThrow('No handler available');
    });

    it('connect delegates to handler and sendKey delegates after connect', async () => {
      const handler = createMockHandler({ isConnected: jest.fn().mockReturnValue(true) });
      registry.register(handler);

      const device = createDevice({ brand: 'samsung_tizen' });
      await registry.connect(device);

      expect(handler.connect).toHaveBeenCalledWith(device);
      expect(registry.getActiveDevice()).toBe(device);
      expect(registry.isConnected()).toBe(true);

      const result = await registry.sendKey('volume_up');
      expect(result).toBe(true);
      expect(handler.sendKey).toHaveBeenCalledWith('volume_up');
    });

    it('sendRawKey delegates to handler when connected', async () => {
      const handler = createMockHandler();
      registry.register(handler);
      await registry.connect(createDevice({ brand: 'samsung_tizen' }));

      await registry.sendRawKey('KEY_NETFLIX');
      expect(handler.sendRawKey).toHaveBeenCalledWith('KEY_NETFLIX');
    });

    it('launchApp delegates to handler when connected', async () => {
      const handler = createMockHandler();
      registry.register(handler);
      await registry.connect(createDevice({ brand: 'samsung_tizen' }));

      await registry.launchApp('111299001912');
      expect(handler.launchApp).toHaveBeenCalledWith('111299001912');
    });

    it('getSupportedKeys and getSupportedKeyGroups return handler values when connected', async () => {
      const handler = createMockHandler();
      registry.register(handler);
      await registry.connect(createDevice({ brand: 'samsung_tizen' }));

      expect(registry.getSupportedKeys()).toEqual(['power', 'volume_up']);
      expect(registry.getSupportedKeyGroups()).toEqual(['power', 'volume']);
    });

    it('disconnect clears active handler and sendKey returns false again', async () => {
      const handler = createMockHandler();
      registry.register(handler);
      await registry.connect(createDevice({ brand: 'samsung_tizen' }));
      await registry.disconnect();

      expect(handler.disconnect).toHaveBeenCalled();
      expect(registry.getActiveDevice()).toBeNull();
      expect(registry.isConnected()).toBe(false);

      const result = await registry.sendKey('volume_up');
      expect(result).toBe(false);
    });
  });

  describe('connection listener', () => {
    it('onConnectionStateChange returns an unsubscribe function', () => {
      const listener: ConnectionListener = jest.fn();
      const unsubscribe = registry.onConnectionStateChange(listener);
      expect(typeof unsubscribe).toBe('function');
      unsubscribe();
      // Listener set is internal; we just verify unsubscribe doesn't throw
    });
  });

  describe('getLastConnectedIp', () => {
    it('returns null when no handler returns an IP', async () => {
      const handler = createMockHandler({ getLastConnectedIp: jest.fn().mockResolvedValue(null) });
      registry.register(handler);
      const ip = await registry.getLastConnectedIp();
      expect(ip).toBeNull();
    });

    it('returns IP from first handler that has one', async () => {
      const handler = createMockHandler({ getLastConnectedIp: jest.fn().mockResolvedValue('192.168.1.5') });
      registry.register(handler);
      const ip = await registry.getLastConnectedIp();
      expect(ip).toBe('192.168.1.5');
    });
  });
});
