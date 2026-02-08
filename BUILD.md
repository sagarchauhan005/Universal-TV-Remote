# Building for Android and iOS

## Prerequisites

- **Android:** Java 17 (e.g. `brew install openjdk@17`), Android SDK. Optional: source `scripts/env.sh` for `JAVA_HOME`/`ANDROID_HOME`.
- **iOS:** Full **Xcode** (from Mac App Store), **CocoaPods** (`brew install cocoapods`).

> **Note:** The iOS build needs the full **Xcode** app, not only “Command Line Tools”. If you see `SDK "iphoneos" cannot be located`, install Xcode from the App Store, then run:
> ```bash
> sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
> ```

---

## Android

```bash
npm run build:android
# or
./scripts/build-android.sh
```

**Output:** `android/app/build/outputs/apk/release/app-release.apk`

Install on device: `adb install -r android/app/build/outputs/apk/release/app-release.apk`

---

## iOS

1. **One-time:** Point the active developer directory to Xcode (if you use the full app):
   ```bash
   sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
   ```

2. **Build:**
   ```bash
   npm run build:ios
   # or
   ./scripts/build-ios.sh
   ```

**Output:** `ios/build/Build/Products/Release-iphoneos/SamsungRemote.app`

For a distributable **.ipa** (TestFlight/App Store), use Xcode: open `ios/SamsungRemote.xcworkspace` → **Product → Archive** → **Distribute App**.
