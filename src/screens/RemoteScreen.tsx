/**
 * Remote Control Screen
 *
 * Thumb-friendly layout optimized for single-handed mobile use.
 *
 * Layout (top → bottom):
 *   1. Big circular TV status orb (connected/disconnected + TV details)
 *   2. Media buttons + Number pad row (same size as bottom buttons)
 *   3. App shortcuts (Netflix, YouTube, Hotstar, Spotify, Apps)
 *   4. D-Pad + OK
 *   5. Channel (left) + Volume (right)
 *   6. Power, Menu, Home, Back, Source (bottom — most used)
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  TouchableOpacity,
  NativeModules,
  Dimensions,
} from 'react-native';
import { useTv } from '../context/TvContext';
import type { StandardRemoteKey, TvBrand } from '../handlers';

const { SamsungTvRemote } = NativeModules;
const SCREEN_WIDTH = Dimensions.get('window').width;

// ─────────────────────────────────────────────────
// Brand accent colors
// ─────────────────────────────────────────────────

const BRAND_ACCENTS: Record<TvBrand, string> = {
  samsung_tizen: '#1428A0',
  lg_webos: '#A50034',
  roku: '#6C3C97',
  android_tv: '#3DDC84',
  vizio: '#D97D29',
  fire_tv: '#FF9900',
  unknown: '#6e7681',
};

// ─────────────────────────────────────────────────
// App shortcuts
// ─────────────────────────────────────────────────

const APP_SHORTCUTS = [
  { label: 'Netflix',  color: '#E50914', key: 'KEY_NETFLIX' },
  { label: 'YouTube',  color: '#FF0000', key: 'KEY_YOUTUBE' },
  { label: 'Hotstar',  color: '#1F49C7', key: 'KEY_HDMI3' },
  { label: 'Spotify',  color: '#1DB954', key: 'KEY_HDMI4' },
  { label: 'Apps',     color: '#484f58', key: 'KEY_APP_LIST' },
];

// ─────────────────────────────────────────────────
// Button
// ─────────────────────────────────────────────────

function Btn({
  label, onPress, style, textStyle,
}: {
  label: string; onPress: () => void; style?: object; textStyle?: object;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.btn, style, pressed && styles.btnPressed]}
      onPress={onPress}
    >
      <Text style={[styles.btnText, textStyle]}>{label}</Text>
    </Pressable>
  );
}

// ─────────────────────────────────────────────────
// Remote Screen
// ─────────────────────────────────────────────────

export function RemoteScreen() {
  const {
    connectedDevice, disconnect, sendKey,
    connectionState, supportedKeyGroups,
  } = useTv();

  const [showNumpad, setShowNumpad] = useState(false);

  const brand = connectedDevice?.brand || 'unknown';
  const accentColor = BRAND_ACCENTS[brand];
  const isOn = connectionState === 'connected';
  const hasGroup = (g: string) => supportedKeyGroups.includes(g as any);
  const k = (key: StandardRemoteKey) => () => sendKey(key);

  const sendRaw = (key: string) => () => {
    if (SamsungTvRemote?.sendKey) { SamsungTvRemote.sendKey(key).catch(() => {}); }
  };

  const handleDisconnect = () => {
    Alert.alert('Disconnect', `Disconnect from ${connectedDevice?.name || 'TV'}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Disconnect', style: 'destructive', onPress: disconnect },
    ]);
  };

  return (
    <View style={styles.container}>

      {/* ═══ TOP: Big circular status orb ═══ */}
      <TouchableOpacity
        style={styles.orbArea}
        onPress={handleDisconnect}
        activeOpacity={0.8}
      >
        <View style={[styles.orb, isOn ? styles.orbOn : styles.orbOff]}>
          <View style={[styles.orbInner, isOn ? styles.orbInnerOn : styles.orbInnerOff]}>
            <Text style={styles.orbIcon}>{isOn ? '\u26A1' : '\u26D4'}</Text>
          </View>
        </View>
        <Text style={styles.orbName} numberOfLines={1}>
          {connectedDevice?.name || connectedDevice?.ip || 'TV'}
        </Text>
        {connectedDevice?.model && (
          <Text style={styles.orbModel}>
            {connectedDevice.model}{connectedDevice.os ? ` \u00B7 ${connectedDevice.os}` : ''}
          </Text>
        )}
        <Text style={[styles.orbStatus, isOn ? styles.orbStatusOn : styles.orbStatusOff]}>
          {isOn ? 'Connected' : 'Disconnected'}{' \u00B7 Tap to disconnect'}
        </Text>
      </TouchableOpacity>

      {/* ═══ MIDDLE CONTROLS ═══ */}
      <View style={styles.controls}>

        {/* Media + Numpad row */}
        <View style={styles.utilRow}>
          {hasGroup('media') && (
            <>
              <Btn label={'\u23EA'} onPress={k('rewind')} style={styles.utilBtn} />
              <Btn label={'\u25B6\uFE0F'} onPress={k('play')} style={[styles.utilBtn, { backgroundColor: accentColor }]} textStyle={{ color: '#fff' }} />
              <Btn label={'\u23F8'} onPress={k('pause')} style={styles.utilBtn} />
              <Btn label={'\u23F9'} onPress={k('stop')} style={styles.utilBtn} />
              <Btn label={'\u23E9'} onPress={k('fast_forward')} style={styles.utilBtn} />
            </>
          )}
          {hasGroup('numbers') && (
            <Btn
              label={showNumpad ? '123 \u25B2' : '123 \u25BC'}
              onPress={() => setShowNumpad(!showNumpad)}
              style={styles.utilBtn}
            />
          )}
        </View>

        {/* Number pad (expandable) */}
        {showNumpad && hasGroup('numbers') && (
          <View style={styles.numGrid}>
            {['1','2','3','4','5','6','7','8','9'].map(n => (
              <Btn key={n} label={n} onPress={k(`num_${n}` as StandardRemoteKey)} style={styles.numBtn} />
            ))}
            <View style={styles.numBtnEmpty} />
            <Btn label="0" onPress={k('num_0')} style={styles.numBtn} />
            <View style={styles.numBtnEmpty} />
          </View>
        )}

        {/* App shortcuts */}
        <View style={styles.appsRow}>
          {APP_SHORTCUTS.map(app => (
            <TouchableOpacity
              key={app.label}
              style={[styles.appBtn, { backgroundColor: app.color }]}
              onPress={sendRaw(app.key)}
              activeOpacity={0.7}
            >
              <Text style={styles.appBtnText}>{app.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* D-Pad */}
        {hasGroup('navigation') && (
          <View style={styles.dpad}>
            <View style={styles.dpadRow}>
              <View style={styles.dpadCell} />
              <Btn label={'\u25B2'} onPress={k('up')} style={styles.dpadBtn} />
              <View style={styles.dpadCell} />
            </View>
            <View style={styles.dpadRow}>
              <Btn label={'\u25C0'} onPress={k('left')} style={styles.dpadBtn} />
              <Btn label="OK" onPress={k('enter')} style={[styles.dpadBtn, styles.okBtn, { backgroundColor: accentColor }]} textStyle={styles.okText} />
              <Btn label={'\u25B6'} onPress={k('right')} style={styles.dpadBtn} />
            </View>
            <View style={styles.dpadRow}>
              <View style={styles.dpadCell} />
              <Btn label={'\u25BC'} onPress={k('down')} style={styles.dpadBtn} />
              <View style={styles.dpadCell} />
            </View>
          </View>
        )}

        {/* Channel (LEFT) + Volume (RIGHT) */}
        {(hasGroup('volume') || hasGroup('channels')) && (
          <View style={styles.volChRow}>
            {hasGroup('channels') && (
              <View style={styles.volChGroup}>
                <Btn label="Ch +" onPress={k('channel_up')} style={styles.volChBtn} />
                <Btn label="Info" onPress={k('info')} style={[styles.volChBtn, styles.infoBtn]} />
                <Btn label="Ch -" onPress={k('channel_down')} style={styles.volChBtn} />
              </View>
            )}
            {hasGroup('volume') && (
              <View style={styles.volChGroup}>
                <Btn label="Vol +" onPress={k('volume_up')} style={styles.volChBtn} />
                <Btn label="Mute" onPress={k('mute')} style={[styles.volChBtn, styles.muteBtn]} textStyle={{ color: '#fff' }} />
                <Btn label="Vol -" onPress={k('volume_down')} style={styles.volChBtn} />
              </View>
            )}
          </View>
        )}

        {/* Bottom row — Power, Menu, Home, Back, Source */}
        <View style={styles.bottomRow}>
          {hasGroup('power') && (
            <Btn label="Power" onPress={k('power')} style={styles.powerBtn} textStyle={styles.powerText} />
          )}
          {hasGroup('menu') && (
            <>
              <Btn label="Menu" onPress={k('menu')} style={styles.bottomBtn} />
              <Btn label="Home" onPress={k('home')} style={[styles.bottomBtn, { backgroundColor: accentColor }]} textStyle={{ color: '#fff' }} />
              <Btn label="Back" onPress={k('back')} style={styles.bottomBtn} />
            </>
          )}
          {hasGroup('power') && (
            <Btn label="Source" onPress={k('source')} style={styles.bottomBtn} />
          )}
        </View>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────
// Dimensions
// ─────────────────────────────────────────────────

const PAD = 14;
const DPAD_SIZE = 56;
const DPAD_GAP = 4;
const BOTTOM_BTN_H = 44;

// ─────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d1117' },

  // ═══ Orb area (top) ═══
  orbArea: {
    alignItems: 'center',
    paddingTop: 48,
    paddingBottom: 12,
  },
  orb: {
    width: 90,
    height: 90,
    borderRadius: 45,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  orbOn: { backgroundColor: 'rgba(63,185,80,0.15)', borderWidth: 2, borderColor: '#3fb950' },
  orbOff: { backgroundColor: 'rgba(248,81,73,0.15)', borderWidth: 2, borderColor: '#f85149' },
  orbInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbInnerOn: { backgroundColor: 'rgba(63,185,80,0.25)' },
  orbInnerOff: { backgroundColor: 'rgba(248,81,73,0.25)' },
  orbIcon: { fontSize: 26 },
  orbName: { fontSize: 16, fontWeight: '700', color: '#e6edf3', maxWidth: SCREEN_WIDTH - 60 },
  orbModel: { fontSize: 12, color: '#6e7681', marginTop: 2 },
  orbStatus: { fontSize: 11, marginTop: 4 },
  orbStatusOn: { color: '#3fb950' },
  orbStatusOff: { color: '#f85149' },

  // ═══ Controls ═══
  controls: {
    flex: 1,
    paddingHorizontal: PAD,
    justifyContent: 'flex-end',
    paddingBottom: 20,
  },

  // ── Base button ──
  btn: {
    backgroundColor: '#21262d',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#30363d',
  },
  btnPressed: { backgroundColor: '#30363d', transform: [{ scale: 0.93 }] },
  btnText: { color: '#c9d1d9', fontWeight: '600', fontSize: 13 },

  // ── Utility row (Media + Numpad toggle) ──
  utilRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 8,
  },
  utilBtn: { height: BOTTOM_BTN_H, flex: 1 },

  // ── Number pad ──
  numGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8, justifyContent: 'center' },
  numBtn: { width: (SCREEN_WIDTH - PAD * 2 - 12) / 3, height: 42 },
  numBtnEmpty: { width: (SCREEN_WIDTH - PAD * 2 - 12) / 3, height: 42 },

  // ── App shortcuts ──
  appsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 10,
  },
  appBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  appBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  // ── D-Pad ──
  dpad: {
    alignSelf: 'center',
    backgroundColor: '#161b22',
    borderRadius: 18,
    padding: 5,
    borderWidth: 1,
    borderColor: '#30363d',
    marginBottom: 10,
  },
  dpadRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  dpadCell: { width: DPAD_SIZE, height: DPAD_SIZE, margin: DPAD_GAP / 2 },
  dpadBtn: { width: DPAD_SIZE, height: DPAD_SIZE, margin: DPAD_GAP / 2 },
  okBtn: { borderRadius: 28 },
  okText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  // ── Channel (left) + Volume (right) ──
  volChRow: { flexDirection: 'row', justifyContent: 'center', gap: 16, marginBottom: 10 },
  volChGroup: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  volChBtn: { width: 56, height: 40 },
  muteBtn: { backgroundColor: '#da3633' },
  infoBtn: { backgroundColor: '#30363d' },

  // ── Bottom row (most used) ──
  bottomRow: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  bottomBtn: {
    flex: 1, height: BOTTOM_BTN_H,
    backgroundColor: '#21262d', borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#30363d',
  },
  powerBtn: {
    flex: 1, height: BOTTOM_BTN_H,
    backgroundColor: '#da3633', borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#da3633',
  },
  powerText: { color: '#fff', fontWeight: '700' },
});
