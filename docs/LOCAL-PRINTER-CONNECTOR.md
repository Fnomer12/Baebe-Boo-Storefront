# Baebe Boo workstation printing

The web server must not enumerate or print to its own printers. Each admin or counter workstation prints one of three ways, easiest first.

## Option A — Direct USB (no install, recommended)

Chrome or Edge on the till talks to the USB thermal printer directly via WebUSB and sends the same raw TSPL bytes as the connector. In the labels or counter page, use the **Direct USB** box: connect, print the test, confirm it came out. IT can verify hardware on the USB probe page (`/BaebeAdmin/products/labels/usb`).

Needs: Chrome/Edge on HTTPS or localhost, XP-365B on USB. Safari/Firefox fall through to Option B. On Windows tills where the OS driver holds the interface, Direct USB needs a one-time WinUSB rebind — see `docs/DIRECT-USB-WINUSB.md`; after it the till prints only through the app.

## Option B — Local printer connector

The browser talks to `http://127.0.0.1:3210`. The connector lists that workstation's printers and submits raw TSPL jobs to the printer selected in the browser. The Baebe Boo server only authenticates the user and generates the print payload.

### Staff install (no manual Node steps)

Download the tarball for the till OS and follow `packages/printer-bridge/README.md`. Linux:

```bash
tar xzf baebe-bridge-linux-x64.tar.gz
cd baebe-bridge-linux
./install-linux.sh
```

The installer ensures `cups-client`, reuses system Node 20+ or fetches an official Node 22 runtime automatically, and enables autostart (systemd user service + desktop entry).

### Run from source (developers)

Install Node.js 20 or newer on the workstation and make sure its native printer service is available:

- Linux/macOS: CUPS with `lpstat` and `lp` on `PATH`.
- Windows: PowerShell with the normal Windows Print Spooler service running.

From this repository:

```bash
npm ci
npm run printer:bridge
```

Build the staff tarball (and `.deb` on Debian/Ubuntu with `dpkg-deb`):

```bash
npm run printer:bridge:build:linux
```

Keep the process running while using the admin or counter portal. The production site is allowed by default. For another deployment or local environment, set:

```bash
BAEBE_PRINTER_ALLOWED_ORIGINS=https://your-site.example,http://localhost:3000 npm run printer:bridge
```

The connector listens only on loopback; it is not exposed to the network. It refuses browser requests from origins that are not in the allow-list.

## Option C — PDF fallback

Labels and receipts can always be downloaded as exact-size PDFs (print at "Actual size", never "Fit").

## Expected flow

1. Open the admin labels page or counter sales page on the same workstation as the printer.
2. The page offers Direct USB first, then the local connector, and shows printers from that workstation only.
3. Select a printer and send the physical test page.
4. Confirm the test page came out.
5. The page requests the real label or receipt payload from the server and sends that payload over the verified transport.

If neither transport is available, the portal shows a setup error and does not fall back to the server's printer list.
