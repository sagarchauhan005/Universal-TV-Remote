# Install app on phone via wireless debugging

Do these **on your phone** first, then **in Terminal** on your Mac.

---

## On your phone

1. **Get your IP:** Settings → **Wi‑Fi** → tap your connected network → note **IP address** (e.g. `192.168.1.45`).

2. **Enable wireless debugging:** Settings → **Developer options** → turn on **Wireless debugging** → tap **Wireless debugging**.

3. **Pair (first time only):** Tap **Pair device with pairing code**. Note:
   - **IP:pairing_port** (e.g. `192.168.1.45:38472`)
   - **6‑digit code**
   - **Connection port** (e.g. `5555` or the number shown for “Connect via network”)

---

## On your Mac (Terminal)

**1. Go to project and load env**
```bash
cd /Users/sagar/Documents/Development/Apps/SamsungRemote
source scripts/env.sh
```

**2. Pair (first time only)**  
Replace `YOUR_IP` and `PAIR_PORT` with the values from the phone (e.g. `192.168.1.45` and `38472`). Enter the 6‑digit code when asked.
```bash
adb pair YOUR_IP:PAIR_PORT
```

**3. Connect**  
Replace `YOUR_IP` and `CONNECT_PORT` (e.g. `5555` or the port from the Wireless debugging screen).
```bash
adb connect YOUR_IP:CONNECT_PORT
adb devices
```
You should see your phone in the list.

**4. Install and run the app**
```bash
./scripts/run-on-phone.sh YOUR_IP CONNECT_PORT
```
Example: `./scripts/run-on-phone.sh 192.168.1.45 5555`

---

After the first time you only need **step 3 (connect)** and **step 4**; pairing is one-time unless you reset the phone.
