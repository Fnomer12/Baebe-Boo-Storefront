# Baebe Boo local printer connector

The web server must not enumerate or print to its own printers. Each admin or counter workstation that prints labels or receipts runs this small connector locally.

The browser talks to `http://127.0.0.1:3210`. The connector lists that workstation's printers and submits raw TSPL jobs to the printer selected in the browser. The Baebe Boo server only authenticates the user and generates the print payload.

## Run it

Install Node.js 20 or newer on the workstation and make sure its native printer service is available:

- Linux/macOS: CUPS with `lpstat` and `lp` on `PATH`.
- Windows: PowerShell with the normal Windows Print Spooler service running.

From this repository:

```bash
npm ci
npm run printer:bridge
```

Keep the process running while using the admin or counter portal. The production site is allowed by default. For another deployment or local environment, set:

```bash
BAEBE_PRINTER_ALLOWED_ORIGINS=https://your-site.example,http://localhost:3000 npm run printer:bridge
```

The connector listens only on loopback; it is not exposed to the network. It refuses browser requests from origins that are not in the allow-list.

## Expected flow

1. Open the admin labels page or counter sales page on the same workstation as the printer.
2. The page checks the local connector and shows printers from that workstation only.
3. Select a local printer and send the physical test page.
4. Confirm the test page came out.
5. The page requests the real label or receipt payload from the server and sends that payload to the local connector.

If the connector is not running, the portal shows a setup error and does not fall back to the server's printer list.
