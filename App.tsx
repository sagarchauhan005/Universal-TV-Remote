/**
 * Universal TV Remote
 *
 * A modular, open-source remote control app that discovers and controls
 * smart TVs on your local Wi-Fi network. Currently supports Samsung Tizen,
 * with an extensible handler system for adding more brands.
 *
 * @format
 */

import React from 'react';
import { StatusBar, useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { TvProvider, useTv } from './src/context/TvContext';
import { DiscoveryScreen } from './src/screens/DiscoveryScreen';
import { RemoteScreen } from './src/screens/RemoteScreen';

function AppNavigator() {
  const { connectionState, connectedDevice } = useTv();

  // Only show the remote screen when fully connected.
  // Connecting/error states stay on the discovery screen with inline feedback.
  const showRemote = connectedDevice && connectionState === 'connected';

  return showRemote ? <RemoteScreen /> : <DiscoveryScreen />;
}

function App() {
  const isDarkMode = useColorScheme() === 'dark';

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <TvProvider>
        <AppNavigator />
      </TvProvider>
    </SafeAreaProvider>
  );
}

export default App;
