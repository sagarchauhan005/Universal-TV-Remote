#!/usr/bin/env bash
# Restart Metro with clean cache and deploy app to connected device (phone or emulator).
# Run this after making changes so the app reflects the latest code.
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/env.sh"
cd "$SCRIPT_DIR/.."

echo "Stopping Metro if running..."
pkill -f "react-native start" 2>/dev/null || true
sleep 2

echo "Starting Metro with reset cache..."
npm run start:clean &
METRO_PID=$!
sleep 10

echo "Building and installing app on connected device..."
npx react-native run-android

echo "Force-stopping and relaunching app so it loads fresh JS bundle from Metro..."
adb shell am force-stop com.samsungremote 2>/dev/null || true
sleep 1
adb shell am start -n com.samsungremote/.MainActivity 2>/dev/null || true

echo "Done. App should show latest changes. Metro is running in background (PID $METRO_PID)."
echo "If you still see old UI: ensure phone and Mac are on same Wi-Fi, then shake device → Reload."
