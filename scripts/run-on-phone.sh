#!/usr/bin/env bash
# Connect to phone over Wi‑Fi and run the app.
# Usage: ./scripts/run-on-phone.sh <PHONE_IP> [CONNECT_PORT]
# Example: ./scripts/run-on-phone.sh 192.168.1.45
# Example: ./scripts/run-on-phone.sh 192.168.1.45 5555

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/env.sh"
cd "$SCRIPT_DIR/.."

PHONE_IP="${1:-}"
CONNECT_PORT="${2:-5555}"

if [ -z "$PHONE_IP" ]; then
  echo "Usage: $0 <PHONE_IP> [CONNECT_PORT]"
  echo ""
  echo "Find your phone IP: Settings → Wi‑Fi → tap your network (or Developer options → Wireless debugging)"
  echo "Default port is 5555. Use the port from the Wireless debugging screen if different."
  echo ""
  echo "Example: $0 192.168.1.45"
  echo "Example: $0 192.168.1.45 37123"
  exit 1
fi

echo "Connecting to ${PHONE_IP}:${CONNECT_PORT}..."
adb connect "${PHONE_IP}:${CONNECT_PORT}"

echo "Checking devices..."
adb devices

echo "Building and launching app on phone..."
npx react-native run-android
