#!/usr/bin/env bash
# Build iOS release (requires CocoaPods and Xcode).
# Usage: ./scripts/build-ios.sh
# Output: ios/build/Build/Products/Release-iphoneos/SamsungRemote.app
#
# Prereqs: Xcode, CocoaPods (gem install cocoapods or brew install cocoapods).
# For an .ipa for distribution, use Xcode: Product → Archive → Distribute App.

set -e
cd "$(dirname "$0")/.."

if ! command -v pod &>/dev/null; then
  echo "CocoaPods not found. Install with: gem install cocoapods (Ruby 3+) or brew install cocoapods"
  exit 1
fi

echo "Installing iOS pods..."
cd ios
pod install
cd ..

echo "Building iOS release..."
cd ios
xcodebuild -workspace SamsungRemote.xcworkspace \
  -scheme SamsungRemote \
  -configuration Release \
  -sdk iphoneos \
  -derivedDataPath build \
  build

APP_PATH="build/Build/Products/Release-iphoneos/SamsungRemote.app"
if [ -d "$APP_PATH" ]; then
  echo ""
  echo "Done. App: $(pwd)/$APP_PATH"
  echo "For .ipa (TestFlight/App Store), use Xcode: Product → Archive → Distribute App."
else
  echo "Build may have failed or app not at expected path."
  exit 1
fi
