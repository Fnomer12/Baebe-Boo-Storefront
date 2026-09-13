# Direct USB on Windows: WinUSB rebind runbook (pilot)

On Windows, `usbprint.sys` (or the vendor driver) owns a USB printer's interface
and Chrome can never claim it — no web code can override that. The fix is a
one-time rebind of the XP-365B to WinUSB with Zadig, after which the till prints
only through the app (Direct USB). No connector process runs on these tills.

## Scope

- Pilot one till first. Other tills keep working as before until the pilot passes.
- Needs: till admin rights, physical access, one restart, Chrome or Edge.

## Procedure (supervised, ~10 min)

1. Unplug other USB devices so nothing gets mis-selected.
2. Download Zadig from https://zadig.akeo.ie/ (single file, no install) and run it as administrator.
3. Options → **List All Devices** → select the XP-365B. Confirm the USB ID reads **1FC9:2016**
   (it may be named "USB Printing Support").
4. Target driver **WinUSB** (not libusb variants) → Replace Driver → wait for success.
5. Restart the computer, then open Chrome fresh (new process, not a tab refresh).
6. Open the USB probe page (`BaebeAdmin → products → labels → usb`) → **Diagnose claim**.
   `CLAIM OK` means the rebind worked. Then **Send calibration test** → physical label.
7. Print one real shelf label and one counter receipt through Direct USB with the
   bridge stopped. Both must work before calling the pilot done.

Expected side effect: the printer vanishes from Windows Printers & Scanners.
That means it worked — Windows printing for that printer is gone by design.

## Rollback

- Zadig → select the device → restore `usbprint`, or Device Manager → right-click
  the device → Update driver → Browse my computer → Let me pick → USB Printing Support.
- Reinstall the vendor driver (`install-windows.ps1 -InstallDriver`) and go back
  to the connector app path.

## Known risks

- **Windows Update can silently roll the driver back** (or replace it). Detection
  is free: the probe shows `claimed` again. Fix: re-run Zadig. Prevention: block
  driver updates for device ID `USBPRINT\XPRINTERXP-365B6494` via device
  installation policy, and prune competing drivers with `pnputil`.
- **Wrong device replaced.** The unplug-others + ID-match steps exist for this
  reason. Never rebind hubs, composite parents, keyboards, or storage.
- **No admin on the till.** Zadig is impossible there — those tills stay on the
  connector app, which is unaffected by all of this.
- **Chrome policy disables WebUSB.** Check `chrome://policy`; allowlist WebUSB
  or keep that till on the connector.

## In-app support

- `WinUsbGuideCard` (setup pages on `claimed` failures, always on the probe page)
  carries the same steps, the USB ID, and the revert path.
- `buildClaimedMessage(true)` in `src/lib/labels/webusb-print.ts` points Windows
  tills at the rebind; other platforms keep the connector guidance.
