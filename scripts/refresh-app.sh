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
sleep 6

echo "Building and installing app on connected device..."
npx react-native run-android

echo "Done. App should show latest changes. Metro is running in background (PID $METRO_PID)."
