"use client";

import { useEffect, useState } from "react";
import { ExternalLink, TriangleAlert, Wrench } from "lucide-react";
import { isWindowsPlatform, XPRINTER_USB_ID, ZADIG_URL } from "@/lib/labels/webusb-print";

/**
 * One-time Windows fix for driver-held printers: rebind the XP-365B to WinUSB
 * with Zadig so Chrome can claim it. Mount-gated so server and client render
 * the same thing (no hydration mismatch). After the rebind the till prints
 * only through the app — Windows printing for that printer stops.
 */
export default function WinUsbGuideCard({ visible }: { visible: boolean }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!visible || !mounted || !isWindowsPlatform()) return null;

  return (
    <div className="mt-3 rounded-2xl border border-amber-300/60 bg-amber-50 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-amber-950">
        <Wrench size={16} /> Free the printer for Direct USB — one time, ~10 min
      </p>
      <p className="mt-1 text-xs leading-5 text-amber-900/80">
        Windows gave the XP-365B to its own printing stack, which is why Chrome can see it but never claim it. Rebinding
        it to WinUSB hands it to the browser instead. Afterwards this till prints <strong>only</strong> through the app.
      </p>
      <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-xs leading-5 text-amber-950">
        <li>Unplug other USB devices so nothing gets mis-selected. Needs admin rights + one restart.</li>
        <li>
          Download <a href={ZADIG_URL} target="_blank" rel="noopener noreferrer" className="font-semibold underline underline-offset-2">Zadig <ExternalLink size={11} className="inline" /></a> (single file, no install) and run it as administrator.
        </li>
        <li>Options → <strong>List All Devices</strong> → select the XP-365B (match USB ID {XPRINTER_USB_ID}).</li>
        <li>Target driver <strong>WinUSB</strong> → Replace Driver → wait for success.</li>
        <li>Restart the computer, then open Chrome fresh and come back here.</li>
        <li>Use Diagnose claim on the USB probe page: <strong>CLAIM OK</strong> means it worked — then send a test print.</li>
      </ol>
      <p className="mt-3 flex items-start gap-2 rounded-xl bg-white/70 px-3 py-2 text-[11px] leading-5 text-amber-950">
        <TriangleAlert size={14} className="mt-0.5 shrink-0" />
        Pilot one till first. If Windows Update ever rolls the driver back (the probe shows claimed again), just re-run
        Zadig. To undo entirely: Zadig → restore usbprint, or Device Manager → Update driver → pick USB Printing Support.
      </p>
    </div>
  );
}
