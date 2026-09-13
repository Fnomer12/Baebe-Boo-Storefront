# Baebe Boo printer connector — staff install

Three ways to print, easiest first. Staff should try them in this order.

## Option A — Direct USB (no install, recommended)

1. Open the labels or counter page in **Chrome or Edge** on the till (HTTPS or localhost).
2. In the **Direct USB** box, click **Connect USB printer** and pick the label printer.
3. Click **Print test page**, check it physically came out, then **I see it — continue**.
4. Print normally. The browser sends the same raw TSPL bytes as the connector app.

If the browser has no Direct USB box (Safari/Firefox) or the till reports the
device is claimed by the OS driver, use Option B.

Hardware check for IT: open `/BaebeAdmin/products/labels/usb` (USB probe) on the
till to list paired devices, endpoints, and send a calibration label.

## Option B — Connector app (Windows / macOS / Linux)

Download the tarball for the till OS from the release page and follow the section below.

### Linux (Ubuntu/Debian)

```bash
tar xzf baebe-bridge-linux-x64.tar.gz
cd baebe-bridge-linux
./install-linux.sh
curl http://127.0.0.1:3210/health
```

The installer ensures `cups-client`, reuses system Node 20+ or downloads an
official Node 22 runtime into the app dir (no manual Node steps), installs the
bridge to `~/.local/share/baebe-bridge`, and enables autostart via a systemd
user service plus a desktop autostart entry.

Useful commands:

```bash
systemctl --user status baebe-bridge
journalctl --user -u baebe-bridge -f
curl http://127.0.0.1:3210/v1/printers
```

Config lives in `~/.config/baebe-bridge/env`:

```bash
BAEBE_PRINTER_BRIDGE_PORT=3210
BAEBE_PRINTER_ALLOWED_ORIGINS=https://your-site.example,http://localhost:3000
```

Custom install: `./install-linux.sh --prefix /opt/baebe-bridge --port 3210 --origins https://...`.
Servers without a desktop: `./install-linux.sh --no-service`, then run under your
process manager, plus `sudo loginctl enable-linger $USER` for boot-time start.

### Windows

1. Install the XP-365B driver first and print a Windows test page.
2. Extract `baebe-bridge-win32-x64.tar.gz`, right-click `install-windows.ps1` → **Run with PowerShell**
   (or `powershell -ExecutionPolicy Bypass -File install-windows.ps1`). No admin rights needed: it reuses
   Node 20+ if present, else installs it via winget or a portable download, then adds a Startup shortcut
   and starts the connector.
3. Verify: the installer checks `http://127.0.0.1:3210/health` itself. If it fails, double-click
   `baebe-bridge.cmd` in `%LOCALAPPDATA%\baebe-bridge` to see the error.
4. Open the Baebe Boo counter page on this till and pick the printer. The connector auto-starts at every login.

### macOS

1. Extract `baebe-bridge-darwin-*.tar.gz` to `~/.local/share/baebe-bridge`.
2. Ensure Node 20+ (`brew install node@22`) and add the printer in System Settings.
3. Load the LaunchAgent template (adjust paths first):
   `launchctl load ~/Library/LaunchAgents/tech.jtechinnovations.baebe-bridge.plist`.
4. Verify: `curl http://127.0.0.1:3210/health`.

## Printer drivers (XP-365B, Windows)

Shop tills need the vendor driver before Windows — and therefore the connector —
can see the printer at all. Staff never hunt for it:

- The printer setup pages show a driver card on Windows (our hosted copy once
  published, otherwise a deep link to XPrinter's official drivers page).
- `install-windows.ps1 -InstallDriver` downloads the vendored driver, verifies
  its SHA-256, attempts a silent install, and verifies the spooler queue.

Driver versions are pinned in `drivers.json` (the single source of truth, also
served to the UI via `GET /api/printer-driver`). To publish a new driver:

1. Download "Label printer (Windows)" from https://www.xprintertech.com/drivers-2.html.
2. Confirm `xprinter.inf` covers `USBPRINT\XPRINTERXP-365B6494` and note the vendor version.
3. `sha256sum` the zip, host it as a release asset, and flip the entry to
   `"status": "verified"` with `fileName`, `downloadUrl`, `sha256`, `sizeBytes`.
4. `npx vitest run src/printer-drivers.test.ts` must pass (it fails closed on
   unpublished-but-linked entries).
5. Re-check quarterly — XPrinter updates drivers without notice.

Redistribution of XPrinter's proprietary installer needs their written
permission; see `driver-permission-request.txt` for the draft request.

## Option C — PDF fallback

Labels and receipts can always be downloaded as PDF (exact-size pages; print at
“Actual size”, never “Fit”) from the same pages.

## For developers

Build the tarball from this repo:

```bash
node scripts/build-printer-bridge.mjs --platform linux
node scripts/build-printer-bridge.mjs --platform win32
node scripts/build-printer-bridge.mjs --platform darwin
```

Output lands in `dist/`. On Debian/Ubuntu with `dpkg-deb`, the linux build also
produces `dist/baebe-bridge_<version>_amd64.deb`.
