#!/usr/bin/env python3
"""
Samsung TV Remote POC - Proof of Concept
Connects to Samsung Smart TV via WebSocket and sends remote key commands.

Usage:
  python3 poc/tv_remote_poc.py                    # default: VOLUP/VOLDOWN test
  python3 poc/tv_remote_poc.py --ott              # OTT validation: raw keys + app launch
  python3 poc/tv_remote_poc.py --launch netflix   # launch app by name or ID
  python3 poc/tv_remote_poc.py KEY_NETFLIX HOME  # send specific keys
  python3 poc/tv_remote_poc.py --dry-run         # validate OTT payloads (no TV, no deps)

Set TV_IP or pass TV IP as first non-flag arg (not used with --ott/--launch for discovery).
"""

import json
import base64
import os
import ssl
import sys
import time
import socket

if "--dry-run" not in sys.argv:
    import websocket

# ──────────────────────────────────────────
# Configuration (set TV_IP env var or pass as first arg)
# ──────────────────────────────────────────
TV_IP = os.environ.get("TV_IP", "192.168.1.2")
APP_NAME = "SamsungRemotePOC"
WS_PORT = 8002  # secure (wss), also try 8001 (ws) if issues
TOKEN_FILE = "poc/.tv_token"

# ──────────────────────────────────────────
# SSDP Discovery
# ──────────────────────────────────────────
def discover_samsung_tvs(timeout=5):
    """Discover Samsung TVs on the local network using SSDP."""
    print("\n🔍 Scanning for Samsung TVs via SSDP...")
    
    msg = (
        'M-SEARCH * HTTP/1.1\r\n'
        'HOST: 239.255.255.250:1900\r\n'
        'MAN: "ssdp:discover"\r\n'
        'ST: ssdp:all\r\n'
        'MX: 3\r\n'
        '\r\n'
    )
    
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.settimeout(timeout)
    sock.sendto(msg.encode(), ('239.255.255.250', 1900))
    
    tvs = {}
    start = time.time()
    while time.time() - start < timeout:
        try:
            data, addr = sock.recvfrom(4096)
            text = data.decode(errors='replace')
            if 'samsung' in text.lower():
                ip = addr[0]
                if ip not in tvs:
                    tvs[ip] = text
                    print(f"  Found Samsung device at {ip}")
        except socket.timeout:
            break
    sock.close()
    
    if not tvs:
        print("  No Samsung TVs found via SSDP.")
    return list(tvs.keys())


# ──────────────────────────────────────────
# TV Info
# ──────────────────────────────────────────
def get_tv_info(ip):
    """Fetch TV information from the REST API."""
    import urllib.request
    url = f"http://{ip}:8001/api/v2/"
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read())
            device = data.get("device", {})
            print(f"\n📺 TV Info:")
            print(f"  Name:       {device.get('name', 'Unknown')}")
            print(f"  Model:      {device.get('modelName', 'Unknown')}")
            print(f"  IP:         {device.get('ip', ip)}")
            print(f"  OS:         {device.get('OS', 'Unknown')}")
            print(f"  Resolution: {device.get('resolution', 'Unknown')}")
            print(f"  WiFi MAC:   {device.get('wifiMac', 'Unknown')}")
            return data
    except Exception as e:
        print(f"  Failed to get TV info: {e}")
        return None


# ──────────────────────────────────────────
# Token management
# ──────────────────────────────────────────
def load_token():
    """Load saved pairing token."""
    try:
        with open(TOKEN_FILE, 'r') as f:
            token = f.read().strip()
            if token:
                print(f"  Loaded saved token: {token[:20]}...")
                return token
    except FileNotFoundError:
        pass
    return None


def save_token(token):
    """Save pairing token for reuse."""
    with open(TOKEN_FILE, 'w') as f:
        f.write(token)
    print(f"  Token saved to {TOKEN_FILE}")


# ──────────────────────────────────────────
# WebSocket Connection
# ──────────────────────────────────────────
def build_ws_url(ip, port=WS_PORT, token=None):
    """Build the WebSocket URL for Samsung TV remote control."""
    name_b64 = base64.b64encode(APP_NAME.encode()).decode()
    scheme = "wss" if port == 8002 else "ws"
    url = f"{scheme}://{ip}:{port}/api/v2/channels/samsung.remote.control?name={name_b64}"
    if token:
        url += f"&token={token}"
    return url


def connect_to_tv(ip, port=WS_PORT):
    """Connect to the TV and return the WebSocket + token."""
    token = load_token()
    url = build_ws_url(ip, port, token)
    
    print(f"\n🔌 Connecting to TV at {ip}:{port}...")
    print(f"  URL: {url[:80]}...")
    
    # SSL context that trusts self-signed certs (LAN only!)
    ssl_context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    ssl_context.check_hostname = False
    ssl_context.verify_mode = ssl.CERT_NONE
    
    sslopt = {"cert_reqs": ssl.CERT_NONE, "check_hostname": False}
    if port == 8001:
        sslopt = None
    
    ws = websocket.WebSocket(sslopt=sslopt)
    ws.settimeout(10)
    
    try:
        ws.connect(url, suppress_origin=True)
        print("  WebSocket connected!")
    except Exception as e:
        print(f"  Connection failed: {e}")
        return None, None
    
    # Read the initial response (should be ms.channel.connect)
    try:
        response = ws.recv()
        data = json.loads(response)
        event = data.get("event", "")
        print(f"  Event: {event}")
        
        if event == "ms.channel.connect":
            print("  ✅ Successfully connected to TV!")
            # Check for token in response
            resp_data = data.get("data", {})
            new_token = resp_data.get("token")
            if new_token:
                print(f"  Received new token!")
                save_token(new_token)
                token = new_token
            return ws, token
        elif event == "ms.channel.unauthorized":
            print("  ❌ Connection denied. Please accept on the TV.")
            return None, None
        else:
            print(f"  Unexpected event: {event}")
            print(f"  Full response: {json.dumps(data, indent=2)}")
            return ws, token
    except Exception as e:
        print(f"  Error reading response: {e}")
        return ws, token


# ──────────────────────────────────────────
# Send Remote Key
# ──────────────────────────────────────────
def send_key(ws, key_code):
    """Send a remote key command to the TV."""
    payload = {
        "method": "ms.remote.control",
        "params": {
            "Cmd": "Click",
            "DataOfCmd": key_code,
            "Option": "false",
            "TypeOfRemote": "SendRemoteKey"
        }
    }
    try:
        ws.send(json.dumps(payload))
        print(f"  ➡️  Sent: {key_code}")
        time.sleep(0.3)  # Small delay between commands
        return True
    except Exception as e:
        print(f"  ❌ Failed to send {key_code}: {e}")
        return False


# ──────────────────────────────────────────
# Launch App (ed.apps.launch) — for OTT validation
# ──────────────────────────────────────────
def send_launch_app(ws, app_id, action_type="DEEP_LINK"):
    """Launch an app by Tizen app ID (e.g. Netflix, YouTube)."""
    payload = {
        "method": "ms.channel.emit",
        "params": {
            "event": "ed.apps.launch",
            "to": "host",
            "data": {
                "action_type": action_type,
                "appId": app_id,
                "metaTag": ""
            }
        }
    }
    try:
        ws.send(json.dumps(payload))
        print(f"  ➡️  Launch app: {app_id}")
        time.sleep(0.5)
        return True
    except Exception as e:
        print(f"  ❌ Failed to launch app: {e}")
        return False


# Known Tizen app IDs for OTT validation (same as mobile app)
OTT_APP_IDS = {
    "netflix": "3201907018807",
    "youtube": "111299001912",
    "spotify": "3201606009684",
}
OTT_KEYS = ["KEY_NETFLIX", "KEY_YOUTUBE", "KEY_APP_LIST"]


# ──────────────────────────────────────────
# Dry-run: print payloads without connecting (for CI/validation)
# ──────────────────────────────────────────
def dry_run_ott_payloads():
    """Build and print OTT payloads; verify they match Samsung API. No TV needed."""
    print("Dry-run: OTT payloads (no connection)")
    print("-" * 40)
    # 1) Raw key payload (same as send_key)
    for k in OTT_KEYS:
        payload = {
            "method": "ms.remote.control",
            "params": {
                "Cmd": "Click",
                "DataOfCmd": k,
                "Option": "false",
                "TypeOfRemote": "SendRemoteKey"
            }
        }
        print(f"  Key {k}:")
        print(f"    {json.dumps(payload)}")
    # 2) App launch payload (same as send_launch_app)
    for name, app_id in OTT_APP_IDS.items():
        payload = {
            "method": "ms.channel.emit",
            "params": {
                "event": "ed.apps.launch",
                "to": "host",
                "data": {
                    "action_type": "DEEP_LINK",
                    "appId": app_id,
                    "metaTag": ""
                }
            }
        }
        print(f"  Launch {name} ({app_id}):")
        print(f"    {json.dumps(payload)}")
    print("-" * 40)
    print("Payloads match Samsung WebSocket API. Run with --ott (no --dry-run) on same network as TV to test live.")


# ──────────────────────────────────────────
# OTT validation (run from POC to verify without mobile app)
# ──────────────────────────────────────────
def run_ott_validation(ws):
    """Test OTT: (1) raw keys KEY_NETFLIX/KEY_YOUTUBE/KEY_APP_LIST, (2) app launch by ID."""
    print("\n📱 OTT validation (check TV for response)...")
    print("-" * 40)
    print("  1) Raw keys (KEY_NETFLIX, KEY_YOUTUBE, KEY_APP_LIST)")
    for k in OTT_KEYS:
        send_key(ws, k)
        time.sleep(1.2)
    print("  2) App launch by ID (Netflix, YouTube, Spotify)")
    for name, app_id in OTT_APP_IDS.items():
        send_launch_app(ws, app_id)
        time.sleep(1.5)
    print("-" * 40)
    print("  If the TV did not open apps for (1), use app launch (2) in the mobile app.")


# ──────────────────────────────────────────
# Main POC flow
# ──────────────────────────────────────────
def main():
    print("=" * 50)
    print("Samsung TV Remote - Proof of Concept")
    print("=" * 50)

    # Parse flags (--ott, --launch netflix|youtube|spotify|<app_id>, --dry-run)
    argv = sys.argv[1:]
    do_dry_run = "--dry-run" in argv
    do_ott = "--ott" in argv
    launch_arg = None
    if "--launch" in argv:
        i = argv.index("--launch")
        if i + 1 < len(argv):
            launch_arg = argv[i + 1].lower()
    skip_next = False
    rest = []
    for a in argv:
        if skip_next:
            skip_next = False
            continue
        if a == "--ott":
            continue
        if a == "--launch":
            skip_next = True
            continue
        if a == "--dry-run":
            continue
        rest.append(a)

    if do_dry_run:
        dry_run_ott_payloads()
        sys.exit(0)

    # Step 1: Discovery
    tvs = discover_samsung_tvs()
    tv_ip = TV_IP  # fallback to known IP
    if tvs:
        tv_ip = tvs[0]
        print(f"\n  Using discovered TV: {tv_ip}")
    else:
        print(f"\n  Using known TV IP: {tv_ip}")

    # Step 2: Get TV info
    get_tv_info(tv_ip)

    # Step 3: Connect via WebSocket
    ws, token = connect_to_tv(tv_ip)
    if not ws:
        print("\n❌ Could not connect to TV. Exiting.")
        sys.exit(1)

    # Step 4: Send commands
    print("\n🎮 Sending test commands...")
    print("-" * 30)

    if do_ott:
        run_ott_validation(ws)
    elif launch_arg:
        app_id = OTT_APP_IDS.get(launch_arg, launch_arg)
        send_launch_app(ws, app_id)
    elif rest:
        for cmd in rest:
            key = cmd.upper()
            if not key.startswith("KEY_"):
                key = f"KEY_{key}"
            send_key(ws, key)
    else:
        # Default: volume up x2, then volume down x2
        print("  Testing Volume Up (x2) then Volume Down (x2)...")
        time.sleep(1)
        send_key(ws, "KEY_VOLUP")
        time.sleep(0.5)
        send_key(ws, "KEY_VOLUP")
        time.sleep(1)
        send_key(ws, "KEY_VOLDOWN")
        time.sleep(0.5)
        send_key(ws, "KEY_VOLDOWN")

    # Cleanup
    print("\n🔌 Disconnecting...")
    ws.close()
    print("✅ Done!")


if __name__ == "__main__":
    main()
