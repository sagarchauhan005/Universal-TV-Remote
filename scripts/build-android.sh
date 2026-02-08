#!/usr/bin/env bash
# Build Android release APK.
# Usage: ./scripts/build-android.sh
# Output: android/app/build/outputs/apk/release/app-release.apk

set -e
cd "$(dirname "$0")/.."

# Load Java/Android env if present
[ -f scripts/env.sh ] && source scripts/env.sh

echo "Building Android release APK..."
cd android
./gradlew assembleRelease
cd ..

APK="android/app/build/outputs/apk/release/app-release.apk"
if [ -f "$APK" ]; then
  echo ""
  echo "Done. APK: $APK"
  echo "Install: adb install -r $APK"
else
  echo "Build failed or APK not found."
  exit 1
fi
