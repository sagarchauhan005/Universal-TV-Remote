### Samsung Universal TV Remote (Android)

This doc captures the full context for the **Samsung Universal TV Remote** Android app we’re building: how discovery works, how we connect to Samsung TVs, how tokens are handled, the UI flow, and where the code lives.

---

## Goal

Build a **universal remote** Android app that can:

- **Discover Samsung TVs** on the same Wi‑Fi.
- **Connect** to a selected TV.
- **Send remote keys** (Power, D‑pad, Volume, Channel, Numbers, etc.).
- **Persist pairing token** so the user only has to accept the connection on the TV once.

---

## Target TVs / Compatibility

- Designed for **Samsung Tizen Smart TVs (generally 2016+)** that expose the WebSocket remote API.
- Works on the same LAN/Wi‑Fi network.

Known ports:
- **8002**: secure WebSocket (**`wss://`**) remote control endpoint (used by this app)
- **8001**: non-secure WebSocket (**`ws://`**) endpoint (some models support it; not used currently)

---

## Network discovery (SSDP)

We use SSDP (Simple Service Discovery Protocol) multicast discovery, matching the Python implementation from the `Labs/Network` repo.

- **Multicast address**: `239.255.255.250:1900`
- **M-SEARCH target**:
  - `ST: urn:samsung.com:device:RemoteControlReceiver:1`

Message shape:

```text
M-SEARCH * HTTP/1.1
HOST: 239.255.255.250:1900
MAN: "ssdp:discover"
ST: urn:samsung.com:device:RemoteControlReceiver:1
MX: 3

```

Implementation:
- `app/src/main/java/com/example/samsunguniversaltvremote/tv/TvDiscovery.kt`

Notes:
- Some Android devices/networks require acquiring a **multicast lock** for reliable SSDP receive. We already request `CHANGE_WIFI_MULTICAST_STATE`; adding `WifiManager.MulticastLock` can be done later if needed.

---

## TV connection (WebSocket)

We connect to the Samsung TV remote control WebSocket endpoint.

### URL format

- **Secure endpoint (used)**:
  - `wss://<TV_IP>:8002/api/v2/channels/samsung.remote.control?name=<BASE64_APP_NAME>[&token=<TOKEN>]`

Where:
- `name` is base64 of the app name (e.g. `SamsungRemote`).
- `token` is optional; once paired, it should be supplied to avoid repeated prompts.

### Pairing & token flow

- On first connect, the TV usually shows a prompt: **Allow / Deny**.
- Once accepted, the TV sends an event like:
  - `event: ms.channel.connect`
  - and may include `data.token`
- The token is stored and re-used on subsequent connections.

Android implementation:
- `app/src/main/java/com/example/samsunguniversaltvremote/tv/SamsungTvClient.kt`

Security note:
- Many TVs present **self‑signed TLS certificates**.
- The current implementation trusts all certs for this connection (local LAN use only). This is convenient but not appropriate for untrusted networks.

---

## Sending remote keys

Remote key presses are sent via JSON payload:

```json
{
  "method": "ms.remote.control",
  "params": {
    "Cmd": "Click",
    "DataOfCmd": "KEY_VOLUP",
    "Option": "false",
    "TypeOfRemote": "SendRemoteKey"
  }
}
```

Examples of keys used in this app:
- Navigation: `KEY_UP`, `KEY_DOWN`, `KEY_LEFT`, `KEY_RIGHT`, `KEY_ENTER`, `KEY_RETURN`
- Power: `KEY_POWER`
- Volume: `KEY_VOLUP`, `KEY_VOLDOWN`, `KEY_MUTE`
- Channel: `KEY_CHUP`, `KEY_CHDOWN`
- Home/Menu/Source/Info: `KEY_HOME`, `KEY_MENU`, `KEY_SOURCE`, `KEY_INFO`
- Numbers: `KEY_0` … `KEY_9`
- Media: `KEY_PLAY`, `KEY_PAUSE`, `KEY_STOP`, `KEY_FF`, `KEY_REWIND`

---

## Android app architecture

### State management

- A single `MainViewModel` manages:
  - discovery state
  - selected TV
  - connection state
  - manual IP
  - sending keys

Files:
- `app/src/main/java/com/example/samsunguniversaltvremote/MainViewModel.kt`

Connection state is modeled as:
- `Disconnected`
- `Connecting`
- `Connected`
- `Error(message)`

### Token persistence

We store tokens per TV IP in SharedPreferences.

Files:
- `app/src/main/java/com/example/samsunguniversaltvremote/tv/TokenRepository.kt`

Keys:
- `tv_token_<ip>`
- `last_connected_ip`

---

## UI / UX flow (Jetpack Compose)

### Discovery screen

- “Search for TVs” triggers SSDP discovery.
- Displays discovered TVs (IP list).
- “Quick connect (last used)” if a previous TV was used.
- Manual IP field to connect when SSDP fails.

File:
- `app/src/main/java/com/example/samsunguniversaltvremote/ui/DiscoveryScreen.kt`

### Remote screen

- Shows selected TV IP + Disconnect.
- Shows connecting instructions (“Accept prompt on TV if first time”).
- Remote controls:
  - Power/Source/Menu/Home/Back
  - D‑pad + OK
  - Volume/Channel
  - Number pad
  - Transport controls

File:
- `app/src/main/java/com/example/samsunguniversaltvremote/ui/RemoteScreen.kt`

### Screen routing

- Routing is simple state-based:
  - if a TV is selected and connection state is Connecting/Connected/Error → Remote
  - otherwise → Discovery

File:
- `app/src/main/java/com/example/samsunguniversaltvremote/MainActivity.kt`

---

## Android permissions

Declared in:
- `app/src/main/AndroidManifest.xml`

Used:
- `android.permission.INTERNET` (WebSocket connection)
- `android.permission.ACCESS_NETWORK_STATE` (network awareness)
- `android.permission.CHANGE_WIFI_MULTICAST_STATE` (SSDP/multicast reliability)

---

## Build/dependencies

Gradle module file:
- `app/build.gradle.kts`

Notable dependencies:
- OkHttp (WebSocket)
- lifecycle-viewmodel-compose

---

## How to run

1. Put your Android device on the same Wi‑Fi as the Samsung TV.
2. Open the project in **Android Studio**.
3. Run the app.
4. On the Discovery screen:
   - Tap **Search for TVs**, or
   - Enter the TV IP manually (e.g. `192.168.1.2`) and tap **Connect to IP**.
5. If it’s the first time:
   - Accept the connection prompt on the TV.

---

## Troubleshooting

- **No TVs found**:
  - Try manual IP.
  - Ensure TV is powered on.
  - Some routers isolate wireless clients (“AP isolation”) which breaks discovery.
  - Add multicast lock (future enhancement) if SSDP responses don’t arrive.

- **Connection fails / keeps prompting**:
  - Accept the prompt on TV.
  - Token should persist after first success.

- **TV doesn’t respond to keys**:
  - Confirm port `8002` is reachable from your phone.
  - Some keys differ by model/region; try core navigation keys first.

---

## Security note (important)

The current Android WebSocket client accepts self‑signed TLS certs by trusting all certificates and hostnames.

- This is commonly required for Samsung TV LAN control, but it reduces TLS guarantees.
- Keep usage **LAN-only**; do not use this approach for untrusted networks.

---

## Relation to the `Labs/Network` repo

This Android app is built to mirror the already working logic in your Python tooling:

- SSDP discovery matches `tv_auto_controller.py`.
- WebSocket URL and payloads match `samsung_tv_controller.py`.

That ensures behavior stays consistent across your desktop/server controller and the mobile remote.

---

## Next improvements (optional)

- Add `WifiManager.MulticastLock` during discovery.
- Add subnet fallback scan for `:8002` when SSDP fails.
- Better TV identity:
  - parse SSDP response headers for friendly name/model when available
  - show MAC/vendor if discoverable
- Persist a TV list, allow naming TVs (“Living room”, “Bedroom”).
- Add long-press / press+release support for keys (if needed).
- Add a proper cert pinning approach for specific TV certs (advanced).
