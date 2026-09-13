#!/usr/bin/env bash
# One-step Linux installer for shop staff (Ubuntu/Debian first).
# Usage:
#   tar xzf baebe-bridge-linux-x64.tar.gz && cd baebe-bridge-linux-x64
#   ./install-linux.sh [--prefix ~/.local/share/baebe-bridge] [--port 3210] [--origins https://...,...] [--no-service]
#
# What it does:
#  1. Ensures cups-client (lpstat/lp) is present (apt, with sudo; otherwise aborts with the exact command).
#  2. Ensures a Node 20+ runtime: reuses system node, else downloads official Node 22 linux-x64 into the app dir.
#  3. Copies bridge files into the prefix dir.
#  4. Enables autostart: systemd user service + XDG desktop autostart entry.
set -euo pipefail

PREFIX="${HOME}/.local/share/baebe-bridge"
PORT="3210"
ORIGINS=""
NO_SERVICE="0"

while [ $# -gt 0 ]; do
  case "$1" in
    --prefix) PREFIX="${2:-}"; shift 2 ;;
    --port) PORT="${2:-}"; shift 2 ;;
    --origins) ORIGINS="${2:-}"; shift 2 ;;
    --no-service) NO_SERVICE="1"; shift ;;
    -h|--help) sed -n '1,12p' "$0"; exit 0 ;;
    *) echo "Unknown option: $1 (see --help)" >&2; exit 1 ;;
  esac
done

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
log() { echo "[baebe-bridge] $*"; }
need_sudo_apt() { [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1; }

if ! command -v lpstat >/dev/null 2>&1 || ! command -v lp >/dev/null 2>&1; then
  log "Installing CUPS client tools (cups-client)..."
  if command -v apt-get >/dev/null 2>&1; then
    if [ "$(id -u)" -eq 0 ]; then apt-get update && apt-get install -y cups-client;
    elif need_sudo_apt; then sudo apt-get update && sudo apt-get install -y cups-client;
    else echo "Missing cups-client and no sudo. Ask an admin to run: sudo apt install cups-client" >&2; exit 1; fi
  else
    echo "Missing 'lpstat'/'lp'. Install your distro's CUPS client package, then re-run." >&2
    exit 1
  fi
fi

system_node_ok() {
  command -v node >/dev/null 2>&1 && [ "$(node --version | sed 's/^v//' | cut -d. -f1)" -ge 20 ] 2>/dev/null
}

NODE_DIR="$PREFIX/node"
if system_node_ok; then
  log "Found system $(node --version); using it."
else
  if [ -x "$NODE_DIR/bin/node" ]; then
    log "Found bundled $($NODE_DIR/bin/node --version)."
  else
    log "Downloading official Node 22 (linux-x64) into $NODE_DIR ..."
    NODE_VER="v22.22.2"
    TMP="$(mktemp -d)"
    trap 'rm -rf "$TMP"' EXIT
    if command -v curl >/dev/null 2>&1; then
      curl -fsSL -o "$TMP/node.tar.xz" "https://nodejs.org/dist/${NODE_VER}/node-${NODE_VER}-linux-x64.tar.xz"
    elif command -v wget >/dev/null 2>&1; then
      wget -qO "$TMP/node.tar.xz" "https://nodejs.org/dist/${NODE_VER}/node-${NODE_VER}-linux-x64.tar.xz"
    else
      echo "Need curl or wget to fetch Node automatically. Install one and re-run." >&2
      exit 1
    fi
    mkdir -p "$NODE_DIR"
    tar -xJf "$TMP/node.tar.xz" -C "$TMP"
    cp -r "$TMP/node-${NODE_VER}-linux-x64/." "$NODE_DIR/"
    rm -rf "$TMP"
    trap - EXIT
    log "Bundled $($NODE_DIR/bin/node --version)."
  fi
fi

mkdir -p "$PREFIX"
cp -f "$SRC_DIR/local-printer-bridge.mjs" "$SRC_DIR/baebe-bridge.sh" "$PREFIX/"
chmod +x "$PREFIX/baebe-bridge.sh"

CONFIG_DIR="${HOME}/.config/baebe-bridge"
mkdir -p "$CONFIG_DIR"
ENV_FILE="$CONFIG_DIR/env"
{
  echo "BAEBE_PRINTER_BRIDGE_PORT=${PORT}"
  if [ -n "$ORIGINS" ]; then echo "BAEBE_PRINTER_ALLOWED_ORIGINS=${ORIGINS}"; fi
} > "$ENV_FILE"
log "Wrote $ENV_FILE"

if [ "$NO_SERVICE" = "1" ]; then
  log "Skipping autostart (--no-service). Start manually: $PREFIX/baebe-bridge.sh"
  exit 0
fi

SERVICE_SRC="$SRC_DIR/baebe-bridge.service"
if command -v systemctl >/dev/null 2>&1; then
  mkdir -p "${HOME}/.config/systemd/user"
  sed "s|%h|${HOME}|g" "$SERVICE_SRC" > "${HOME}/.config/systemd/user/baebe-bridge.service"
  # Point ExecStart at the real install location (template uses the default).
  sed -i "s|${HOME}/.local/share/baebe-bridge|${PREFIX}|g" "${HOME}/.config/systemd/user/baebe-bridge.service"
  systemctl --user daemon-reload || true
  systemctl --user enable --now baebe-bridge.service || log "systemd enable failed; desktop autostart below still applies."
  log "systemd user service enabled. Check: systemctl --user status baebe-bridge"
  if [ -z "${XDG_RUNTIME_DIR:-}" ]; then
    log "Note: enable lingering for boot-time start without login: sudo loginctl enable-linger $USER"
  fi
fi

AUTOSTART_DIR="${HOME}/.config/autostart"
mkdir -p "$AUTOSTART_DIR"
sed -e "s|%h|${HOME}|g" -e "s|${HOME}/.local/share/baebe-bridge|${PREFIX}|g" "$SRC_DIR/baebe-bridge.desktop" > "$AUTOSTART_DIR/baebe-boo-printer-connector.desktop"
log "Desktop autostart entry installed."

log "Running readiness check..."
if ! BAEBE_PRINTER_BRIDGE_PORT="$PORT" "$PREFIX/baebe-bridge.sh" --doctor; then
  log "Readiness check found a problem (see FAIL lines above). Fix it, then re-run: $PREFIX/baebe-bridge.sh --doctor"
fi
if curl -fsS --max-time 3 "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1; then
  log "DONE. The connector answers on http://127.0.0.1:${PORT}/health."
  log "Open the Baebe Boo counter page on THIS SAME till and press Retry on the printer list."
else
  log "The connector is installed but not running yet."
  log "Start it now: $PREFIX/baebe-bridge.sh"
  log "Then verify: curl http://127.0.0.1:${PORT}/health"
fi
