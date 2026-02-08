/**
 * Discovery Screen
 *
 * Scans the local network for smart TVs and displays them with
 * brand info, model, and IP. User explicitly taps a device to connect.
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  Alert,
  NativeModules,
  Platform,
  Linking,
  // PermissionsAndroid removed — no location permission needed
} from 'react-native';
import { useTv } from '../context/TvContext';
import { registry, type TvDevice, type TvBrand } from '../handlers';

const { SamsungTvRemote } = NativeModules;

// ─────────────────────────────────────────────────
// Brand Display Config
// ─────────────────────────────────────────────────

const BRAND_CONFIG: Record<TvBrand, { label: string; color: string; icon: string }> = {
  samsung_tizen: { label: 'Samsung', color: '#1428A0', icon: '📺' },
  lg_webos:      { label: 'LG',      color: '#A50034', icon: '📺' },
  roku:          { label: 'Roku',    color: '#6C3C97', icon: '📡' },
  android_tv:    { label: 'Android TV', color: '#3DDC84', icon: '📺' },
  vizio:         { label: 'Vizio',   color: '#D97D29', icon: '📺' },
  fire_tv:       { label: 'Fire TV', color: '#FF9900', icon: '🔥' },
  unknown:       { label: 'Unknown', color: '#6e7681', icon: '❓' },
};

// ─────────────────────────────────────────────────
// Compact Device Card
// ─────────────────────────────────────────────────

function DeviceCard({
  device,
  onPress,
  isConnecting,
  connectingDeviceId,
}: {
  device: TvDevice;
  onPress: () => void;
  isConnecting: boolean;
  connectingDeviceId: string | null;
}) {
  const brand = BRAND_CONFIG[device.brand] || BRAND_CONFIG.unknown;
  const isThisConnecting = isConnecting && connectingDeviceId === device.id;

  return (
    <TouchableOpacity
      style={[styles.deviceCard, isThisConnecting && styles.deviceCardConnecting]}
      onPress={onPress}
      disabled={isConnecting}
      activeOpacity={0.7}
    >
      <View style={styles.deviceCardRow}>
        <Text style={styles.deviceIcon}>{brand.icon}</Text>
        <View style={styles.deviceInfo}>
          <Text style={styles.deviceName} numberOfLines={1}>{device.name}</Text>
          <Text style={styles.deviceSub}>
            {device.ip}{device.model ? ` · ${device.model}` : ''}
          </Text>
        </View>
        {isThisConnecting ? (
          <ActivityIndicator color="#58a6ff" size="small" />
        ) : (
          <View style={[styles.connectAction, isConnecting && { opacity: 0.4 }]}>
            <Text style={styles.connectActionText}>Connect</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

// ─────────────────────────────────────────────────
// Discovery Screen
// ─────────────────────────────────────────────────

export function DiscoveryScreen() {
  const {
    discover,
    connect,
    discoveredDevices,
    lastConnectedIp,
    isDiscovering,
    errorMessage,
    connectionState,
  } = useTv();

  const [manualIp, setManualIp] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [connectingDeviceId, setConnectingDeviceId] = useState<string | null>(null);
  const [networkInfo, setNetworkInfo] = useState<{ ip: string; ssid: string } | null>(null);

  const isConnecting = connectionState === 'connecting';

  useEffect(() => {
    if (lastConnectedIp && !manualIp) { setManualIp(lastConnectedIp); }
  }, [lastConnectedIp, manualIp]);

  useEffect(() => {
    if (connectionState !== 'connecting') { setConnectingDeviceId(null); }
  }, [connectionState]);

  useEffect(() => {
    if (connectionState === 'error' && errorMessage) {
      const isDenied = errorMessage.toLowerCase().includes('denied') || errorMessage.toLowerCase().includes('unauthorized');
      Alert.alert(
        isDenied ? 'TV Denied Connection' : 'Connection Failed',
        isDenied
          ? 'The TV is blocking your phone.\n\n' +
            'Fix: Power cycle the TV — turn it OFF, unplug the power cable for 30 seconds, then plug back in.\n\n' +
            'Or go to TV Settings → General → External Device Manager → Device Connection Manager and remove blocked devices.\n\n' +
            'After restarting the TV, try connecting again.'
          : `${errorMessage}\n\nTip: Ensure the TV is on and on the same Wi-Fi network.`,
        [{ text: 'OK' }],
      );
    }
  }, [connectionState, errorMessage]);

  // Fetch network info on mount (no location permission needed — SSID is best-effort)
  useEffect(() => {
    if (Platform.OS === 'android' && SamsungTvRemote) {
      SamsungTvRemote.getNetworkInfo()
        .then((info: { ip: string; ssid: string }) => { if (info) { setNetworkInfo(info); } })
        .catch(() => {});
    }
  }, []);

  const handleDiscover = () => {
    setHasSearched(true);
    discover();
  };

  const handleConnectDevice = (device: TvDevice) => {
    setConnectingDeviceId(device.id);
    connect(device);
  };

  const handleManualConnect = async () => {
    const ip = manualIp.trim();
    if (!ip) {
      Alert.alert('Enter IP', 'Please enter the TV IP address (e.g. 192.168.1.2).');
      return;
    }
    setConnectingDeviceId(`manual-${ip}`);
    const handlers = registry.getRegisteredHandlers();
    for (const handler of handlers) {
      try {
        const device = await handler.identify(ip);
        if (device) {
          setConnectingDeviceId(device.id);
          connect(device);
          return;
        }
      } catch { /* continue */ }
    }
    connect({ id: `manual-${ip}`, ip, name: `TV at ${ip}`, brand: 'samsung_tizen', port: 8002 });
  };

  const handleQuickConnect = async (ip: string) => {
    setConnectingDeviceId(`quick-${ip}`);
    const handlers = registry.getRegisteredHandlers();
    for (const handler of handlers) {
      try {
        const device = await handler.identify(ip);
        if (device) {
          setConnectingDeviceId(device.id);
          connect(device);
          return;
        }
      } catch { /* continue */ }
    }
    connect({ id: `quick-${ip}`, ip, name: `TV at ${ip}`, brand: 'samsung_tizen', port: 8002 });
  };

  const registeredBrands = registry.getRegisteredHandlers().map((h) => h.displayName);

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {/* Title */}
        <Text style={styles.title}>Smart TV Remote</Text>
        <Text style={styles.subtitle}>
          Discover and control smart TVs on your network
        </Text>

        {/* Network info */}
        <View style={styles.networkBar}>
          <Text style={styles.networkBarText}>
            {networkInfo
              ? (networkInfo.ssid
                  ? `WiFi: ${networkInfo.ssid}  ·  IP: ${networkInfo.ip}`
                  : `Your IP: ${networkInfo.ip}`)
              : 'Detecting network...'}
          </Text>
        </View>

        {/* Brand chips */}
        <View style={styles.brandsRow}>
          {registeredBrands.map((name) => (
            <View key={name} style={styles.brandChip}>
              <Text style={styles.brandChipText}>{name}</Text>
            </View>
          ))}
          <View style={[styles.brandChip, styles.brandChipMore]}>
            <Text style={styles.brandChipMoreText}>+ more coming</Text>
          </View>
        </View>

        {/* Search */}
        <TouchableOpacity
          style={[styles.btn, styles.btnPrimary, (isDiscovering || isConnecting) && styles.btnDisabled]}
          onPress={handleDiscover}
          disabled={isDiscovering || isConnecting}
        >
          {isDiscovering ? (
            <View style={styles.row}>
              <ActivityIndicator color="#fff" size="small" />
              <Text style={styles.btnPrimaryText}> Scanning...</Text>
            </View>
          ) : (
            <Text style={styles.btnPrimaryText}>Search for TVs</Text>
          )}
        </TouchableOpacity>

        {/* Error */}
        {errorMessage && !isDiscovering && connectionState !== 'connecting' && (
          <Text style={styles.error}>{errorMessage}</Text>
        )}

        {/* Empty state */}
        {hasSearched && !isDiscovering && discoveredDevices.length === 0 && !errorMessage && (
          <Text style={styles.emptyHint}>No TVs found. Make sure your TV is on and on the same WiFi.</Text>
        )}

        {/* Discovered devices */}
        {discoveredDevices.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Found {discoveredDevices.length} device{discoveredDevices.length !== 1 ? 's' : ''}
            </Text>
            {discoveredDevices.map((device) => (
              <DeviceCard
                key={device.id}
                device={device}
                onPress={() => handleConnectDevice(device)}
                isConnecting={isConnecting}
                connectingDeviceId={connectingDeviceId}
              />
            ))}
          </View>
        )}

        {/* Manual connect */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Manual connect</Text>
          <View style={styles.manualRow}>
            <TextInput
              style={styles.input}
              placeholder="TV IP (e.g. 192.168.1.2)"
              placeholderTextColor="#484f58"
              value={manualIp}
              onChangeText={setManualIp}
              keyboardType="numeric"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!isConnecting}
            />
            <TouchableOpacity
              style={[styles.btn, styles.btnSecondary, isConnecting && styles.btnDisabled]}
              onPress={handleManualConnect}
              disabled={isConnecting}
            >
              {isConnecting && connectingDeviceId?.startsWith('manual-') ? (
                <ActivityIndicator color="#58a6ff" size="small" />
              ) : (
                <Text style={styles.btnSecondaryText}>Connect</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Recent (last connected IP) */}
        {lastConnectedIp && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recent</Text>
            <TouchableOpacity
              style={[styles.recentItem, isConnecting && styles.btnDisabled]}
              onPress={() => handleQuickConnect(lastConnectedIp)}
              disabled={isConnecting}
            >
              <Text style={styles.recentIp}>{lastConnectedIp}</Text>
              <Text style={styles.recentAction}>Reconnect</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Footer — always at bottom */}
      <View style={styles.footer}>
        <TouchableOpacity
          onPress={() => Linking.openURL('https://www.sagarchauhan.in')}
          activeOpacity={0.7}
        >
          <Text style={styles.footerCredit}>
            Made with <Text style={styles.footerHeart}>{'\u2764\uFE0F'}</Text> by{' '}
            <Text style={styles.footerLink}>Sagar Chauhan</Text>
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d1117',
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: 24,
  },

  // Title
  title: { fontSize: 26, fontWeight: '700', color: '#fff', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#8b949e', marginBottom: 12 },

  // Network info
  networkBar: {
    backgroundColor: '#161b22',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#30363d',
  },
  networkBarText: { color: '#58a6ff', fontSize: 12, fontWeight: '500' },

  // Brand chips
  brandsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16 },
  brandChip: {
    backgroundColor: '#21262d',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#30363d',
  },
  brandChipText: { color: '#c9d1d9', fontSize: 11, fontWeight: '500' },
  brandChipMore: { borderStyle: 'dashed' },
  brandChipMoreText: { color: '#6e7681', fontSize: 11, fontStyle: 'italic' },

  // Buttons
  btn: { borderRadius: 10, paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  btnPrimary: { backgroundColor: '#238636' },
  btnSecondary: { backgroundColor: '#21262d', borderWidth: 1, borderColor: '#30363d' },
  btnDisabled: { opacity: 0.5 },
  btnPrimaryText: { fontSize: 15, fontWeight: '600', color: '#fff' },
  btnSecondaryText: { fontSize: 14, fontWeight: '600', color: '#c9d1d9' },
  row: { flexDirection: 'row', alignItems: 'center' },

  // Error / empty
  error: { color: '#f85149', marginTop: 8, fontSize: 13 },
  emptyHint: { color: '#8b949e', marginTop: 10, fontSize: 13 },

  // Section
  section: { marginTop: 16 },
  sectionTitle: { fontSize: 11, color: '#6e7681', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },

  // Device card
  deviceCard: {
    backgroundColor: '#161b22',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#30363d',
  },
  deviceCardConnecting: { borderColor: '#58a6ff' },
  deviceCardRow: { flexDirection: 'row', alignItems: 'center' },
  deviceIcon: { fontSize: 22, marginRight: 10 },
  deviceInfo: { flex: 1 },
  deviceName: { fontSize: 14, fontWeight: '600', color: '#e6edf3' },
  deviceSub: { fontSize: 11, color: '#6e7681', marginTop: 1 },
  connectAction: {
    backgroundColor: '#238636',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  connectActionText: { color: '#fff', fontSize: 12, fontWeight: '600' },

  // Manual connect
  manualRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: {
    flex: 1,
    backgroundColor: '#21262d',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#30363d',
  },

  // Recent
  recentItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#161b22',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#30363d',
  },
  recentIp: { fontSize: 14, fontWeight: '600', color: '#58a6ff' },
  recentAction: { fontSize: 12, color: '#8b949e' },

  // Footer
  footer: { alignItems: 'center', paddingBottom: 16, paddingTop: 20 },
  footerCredit: { fontSize: 12, color: '#6e7681' },
  footerHeart: { color: '#f85149' },
  footerLink: { color: '#58a6ff', textDecorationLine: 'underline' },
});
