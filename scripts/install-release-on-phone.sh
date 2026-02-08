#!/usr/bin/env bash
# Install the release APK on your phone (first physical device, or specify serial).
# Run ./scripts/build-android.sh first, or this will build release then install.
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/env.sh"
cd "$SCRIPT_DIR/.."

APK="android/app/build/outputs/apk/release/app-release.apk"
if [ ! -f "$APK" ]; then
  echo "Release APK not found. Building..."
  ./scripts/build-android.sh
fi

# Prefer phone (CPH2411 / non-emulator); fallback to single device
SERIAL=""
for dev in $(adb devices | grep -v List | grep device | awk '{print $1}'); do
  if [[ "$dev" != emulator-* ]]; then
    SERIAL="$dev"
    break
  fi
done
if [ -z "$SERIAL" ]; then
  SERIAL=$(adb devices | grep -v List | grep device | head -1 | awk '{print $1}')
fi

if [ -z "$SERIAL" ]; then
  echo "No device found. Connect your phone (USB or wireless ADB) and try again."
  exit 1
fi

echo "Installing release APK on $SERIAL..."
adb -s "$SERIAL" install -r "$APK"
echo "Done. Open Universal TV Remote on your phone (release build)."
