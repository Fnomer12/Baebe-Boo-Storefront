"use client";

import { useEffect, useState } from "react";
import { ArrowDownToLine, ListChecks, RefreshCw } from "lucide-react";
import { WINDOWS_SETUP_FILE, WINDOWS_SETUP_URL } from "@/lib/till-setup";
import { isWindowsPlatform } from "@/lib/labels/webusb-print";

/**
 * Plain-words rescue card shown when the till has no working print path.
 * One download, one double-click, three numbered steps — no jargon.
 */
export default function TillSetupHelp({ onRetry }: { onRetry: () => void }) {
  // Mount-gated so server and first client render agree (no hydration mismatch).
  const [windows, setWindows] = useState(false);
  useEffect(() => {
    setWindows(isWindowsPlatform());
  }, []);

  return (
    <div className="mt-3 rounded-2xl border border-black/[0.07] bg-[#fbfcfc] p-4">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <ListChecks size={16} /> Printing isn&apos;t set up on this till yet
      </p>
      {windows ? (
        <>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs leading-5 text-black/60">
            <li>Tap the button below to download the setup file.</li>
            <li>
              Open it and double-click <strong>{WINDOWS_SETUP_FILE}</strong>, click Yes, and wait until it says DONE.
            </li>
            <li>Come back here and press Retry below.</li>
          </ol>
          <div className="mt-3 flex gap-2">
            <a href={WINDOWS_SETUP_URL} className="admin-button min-h-11 flex-1 text-xs">
              <ArrowDownToLine size={15} /> Download till setup
            </a>
            <button
              type="button"
              onClick={onRetry}
              className="admin-button admin-button-secondary min-h-11 flex-1 text-xs"
            >
              <RefreshCw size={13} /> Retry
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="mt-2 text-xs leading-5 text-black/60">
            This till needs its one-time printer setup. Ask your technician to set it up, then press Retry.
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="admin-button admin-button-secondary mt-3 min-h-11 w-full text-xs"
          >
            <RefreshCw size={13} /> Retry
          </button>
        </>
      )}
    </div>
  );
}
