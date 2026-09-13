#!/usr/bin/env bash
# Baebe Boo printer connector launcher (Linux).
# Staff never touch Node directly: this script finds a Node 20+ runtime
# (system node, ~/.local/share/baebe-bridge/node, or /opt/baebe-bridge/node)
# and starts the bundled bridge. It exits non-zero with a plain-English
# message when nothing usable is found so the portal can show setup help.
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BRIDGE="$APP_DIR/local-printer-bridge.mjs"

pick_node() {
  for candidate in \
    "${BAEBE_BRIDGE_NODE:-}" \
    "$APP_DIR/node/bin/node" \
    "$HOME/.local/share/baebe-bridge/node/bin/node" \
    "/opt/baebe-bridge/node/bin/node" \
    "$(command -v node || true)"; do
    if [ -n "$candidate" ] && [ -x "$candidate" ]; then
      major="$("$candidate" --version 2>/dev/null | sed 's/^v//' | cut -d. -f1 || echo 0)"
      if [ "${major:-0}" -ge 20 ] 2>/dev/null; then
        echo "$candidate"
        return 0
      fi
    fi
  done
  return 1
}

if [ ! -f "$BRIDGE" ]; then
  echo "Baebe Boo printer connector is missing local-printer-bridge.mjs next to $0." >&2
  exit 1
fi

NODE="$(pick_node || true)"
if [ -z "$NODE" ]; then
  echo "Baebe Boo printer connector needs Node.js 20+. Re-run install-linux.sh (it installs Node automatically) or set BAEBE_BRIDGE_NODE=/path/to/node." >&2
  exit 1
fi

for tool in lpstat lp; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "Baebe Boo printer connector needs CUPS client tools (missing '$tool'). Install with: sudo apt install cups-client" >&2
    exit 1
  fi
done

PORT="${BAEBE_PRINTER_BRIDGE_PORT:-3210}"
LOG="$APP_DIR/bridge.log"
if [ "${1:-}" = "--doctor" ] || [ "${1:-}" = "--help" ]; then
  exec "$NODE" "$BRIDGE" "$@"
fi

# Fail fast with a readable message when something else owns the port.
if command -v ss >/dev/null 2>&1 && ss -ltn 2>/dev/null | grep -q "127.0.0.1:$PORT "; then
  if curl -fsS --max-time 3 "http://127.0.0.1:$PORT/health" 2>/dev/null | grep -q baebe-boo-printer-bridge; then
    echo "Baebe Boo printer connector is already running on http://127.0.0.1:$PORT. Nothing to do."
    exit 0
  fi
  echo "Port $PORT is already in use by another program (and it is not this connector)." >&2
  echo "Stop it, or pick a free port: BAEBE_PRINTER_BRIDGE_PORT=3211 $0" >&2
  exit 2
fi

{
  echo "--- $(date -u '+%Y-%m-%dT%H:%M:%SZ') starting Baebe Boo printer connector ---"
  exec "$NODE" "$BRIDGE" "$@" 2>&1
} | tee -a "$LOG"
