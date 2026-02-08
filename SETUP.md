# SamsungRemote – Run on Android

## One-time setup

### 1. Install Java 17 (required for Android build)

```bash
brew install openjdk@17
```

This can take a few minutes. After it finishes, the project scripts will pick it up automatically.

### 2. Android SDK & emulator

- **Android SDK**: You already have it at `~/Library/Android/sdk`. The project uses `android/local.properties` and `scripts/env.sh` so Gradle and `adb` find it.
- **Emulator**: Start an AVD from **Android Studio → Device Manager** (or start an existing one). Leave it running.

## Run the app

1. **Start Metro** (in one terminal):
   ```bash
   npm start
   ```

2. **With the emulator running**, in another terminal:
   ```bash
   npm run android:dev
   ```
   Or: `./scripts/run-android.sh`

The app will build, install on the emulator, and open. Use **Ctrl+M** (or **Cmd+M**) on the emulator for the dev menu and **Reload**.

---

## Run on a physical phone (Wi‑Fi debugging)

Use this to install and debug on your Android phone over Wi‑Fi (no USB after setup). Phone and Mac must be on the **same Wi‑Fi network**.

### How to find your phone’s IP address

Use any of these on your **Android phone** (while connected to Wi‑Fi):

**Option A – Wi‑Fi settings (simplest)**  
1. Open **Settings → Network & internet** (or **Settings → Wi‑Fi**).  
2. Tap the **Wi‑Fi network** you’re connected to.  
3. The **IP address** is shown there (e.g. `192.168.1.45`).

**Option B – Developer options (Wireless debugging)**  
1. **Settings → Developer options → Wireless debugging**.  
2. Turn it **On** and tap **Wireless debugging**.  
3. The **IP address and port** are at the top (e.g. `192.168.1.45:5555`). Use this same IP for pairing and for the script below.

**Option C – About phone**  
1. **Settings → About phone → Status** (or **SIM status** / **IP address**).  
2. Find **IP address** (Wi‑Fi).

Use that IP (and port from Wireless debugging if you use it) in the commands below.

### Step 1: Enable Developer options on the phone

1. Open **Settings → About phone**.
2. Tap **Build number** 7 times until you see “You are now a developer”.

### Step 2: Enable USB debugging (required once)

1. **Settings → Developer options**.
2. Turn on **USB debugging**.

### Step 3: Enable Wireless debugging (Android 11+)

1. In **Developer options**, turn on **Wireless debugging**.
2. Tap **Wireless debugging** → **Pair device with pairing code**.
3. Note:
   - **IP address & port** (e.g. `192.168.1.5:37123` for pairing).
   - **Pairing port** (e.g. `38472`) and the **6‑digit code** on the same screen.

### Step 4: Pair from your Mac (one time per phone)

In a terminal (use the project’s env so `adb` is in PATH):

```bash
source scripts/env.sh   # from project root
adb pair 192.168.1.5:38472
```

When prompted, enter the **6‑digit pairing code** from the phone. You only need to pair once (or after a factory reset).

### Step 5: Connect over Wi‑Fi

On the phone, under **Wireless debugging**, note the **IP address and port** shown for connection (e.g. `192.168.1.5:5555` or a random port). Then on your Mac:

```bash
adb connect 192.168.1.5:5555
```

(Use the IP and port shown on the **Wireless debugging** screen, not the pairing port.)

Check that the device is listed:

```bash
adb devices
```

### Step 6: Run the app on the phone

1. In one terminal: `npm start`
2. In another: `npm run android:dev`

The app will build, install on the connected phone, and open. You can then unplug USB; Wi‑Fi debugging stays active until you turn off Wireless debugging or restart the phone.

### Optional: Connect without pairing (USB once)

If you prefer the older method:

1. Connect the phone via **USB**.
2. Run: `adb tcpip 5555`
3. Unplug USB.
4. On the phone: **Settings → About phone → Status** (or **Wi‑Fi → current network**) to see its **IP address**.
5. Run: `adb connect <PHONE_IP>:5555`

Reconnect after each phone reboot with: `adb connect <PHONE_IP>:5555`.
