"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Camera, Flashlight, FlashlightOff, Keyboard, X } from "lucide-react";
import { AdminModal } from "@/components/admin/AdminWorkspacePrimitives";

type CameraStatus = "starting" | "scanning" | "denied" | "nocamera" | "insecure" | "error";

export type ScanCameraInfo = { id: string; label: string };

/**
 * Back camera first, otherwise the last device. With an empty list (common
 * before the browser grants permission) fall back to a facing-mode constraint
 * so the browser itself prompts instead of us wrongly reporting "no camera".
 */
export function pickScanCameraTarget(
  cameras: ScanCameraInfo[],
): { deviceId: string } | { facingMode: string } {
  const back = cameras.find((camera) => /back|rear|environment/i.test(camera.label || ""));
  if (back) return { deviceId: back.id };
  if (cameras.length > 0) return { deviceId: cameras[cameras.length - 1].id };
  return { facingMode: "environment" };
}

/** Short beep + vibration so the cashier feels a successful scan without looking. */export function signalSaleAdded(): void {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(60);
  } catch {
    // Vibration is best-effort.
  }
  try {
    const Ctor =
      typeof window !== "undefined"
        ? window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        : null;
    if (!Ctor) return;
    const context = new Ctor();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 880;
    gain.gain.value = 0.08;
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.12);
    oscillator.onended = () => void context.close().catch(() => {});
  } catch {
    // Audio is best-effort.
  }
}

/**
 * Till camera scanning for sticker QR and barcodes. Decoded text goes to the
 * parent (same handler as the USB scanner box), so sale, payment and receipt
 * flow stay exactly the same. The camera stops when the modal closes.
 */
export default function ScanCameraModal({
  open,
  onDecode,
  onClose,
}: {
  open: boolean;
  /** Returns true when the code matched an in-stock product and was added. */
  onDecode: (text: string) => boolean;
  onClose: () => void;
}) {
  const elementId = useId().replace(/[^a-zA-Z0-9]/g, "");
  const readerId = `counter-scan-reader-${elementId}`;
  const cooldownRef = useRef(false);
  const resumeTimerRef = useRef<number | null>(null);
  const onDecodeRef = useRef(onDecode);
  useEffect(() => {
    onDecodeRef.current = onDecode;
  });
  const scannerRef = useRef<{
    stop: () => Promise<void>;
    clear: () => void;
    applyVideoConstraints: (constraints: MediaTrackConstraints) => Promise<void>;
    getRunningTrackCapabilities: () => MediaTrackCapabilities;
  } | null>(null);
  const [status, setStatus] = useState<CameraStatus>("starting");
  const [detail, setDetail] = useState("");
  const [seenCount, setSeenCount] = useState(0);
  const [lastOutcome, setLastOutcome] = useState<"added" | "unmatched" | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [manual, setManual] = useState("");

  useEffect(() => {
    if (!open) return;
    if (typeof window !== "undefined" && window.isSecureContext === false) {
      setStatus("insecure");
      return;
    }
    let cancelled = false;
    cooldownRef.current = false;
    scannerRef.current = null;
    setStatus("starting");
    setDetail("");
    setSeenCount(0);
    setLastOutcome(null);
    setTorchOn(false);
    setTorchAvailable(false);

    void (async () => {
      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");
        if (cancelled) return;
        const cameras = (await Html5Qrcode.getCameras().catch(() => [])) as ScanCameraInfo[];
        if (cancelled) return;
        const target = pickScanCameraTarget(cameras);
        const cameraIdOrConfig =
          "deviceId" in target ? target.deviceId : { facingMode: target.facingMode };
        const instance = new Html5Qrcode(readerId, {
          verbose: false,
          formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE, Html5QrcodeSupportedFormats.CODE_128],
        });
        scannerRef.current = instance;
        await instance.start(
          cameraIdOrConfig,
          {
            fps: 10,
            qrbox: { width: 260, height: 260 },
          },
          (decodedText: string) => {
            if (cooldownRef.current || !decodedText.trim()) return;
            cooldownRef.current = true;
            const added = onDecodeRef.current(decodedText) === true;
            setSeenCount((count) => count + 1);
            setLastOutcome(added ? "added" : "unmatched");
            if (resumeTimerRef.current) window.clearTimeout(resumeTimerRef.current);
            resumeTimerRef.current = window.setTimeout(() => {
              cooldownRef.current = false;
            }, 1500);
          },
          () => {},
        );
        if (cancelled) {
          await instance.stop().catch(() => {});
          instance.clear();
          return;
        }
        try {
          const capabilities = instance.getRunningTrackCapabilities() as { torch?: boolean };
          setTorchAvailable(capabilities.torch === true);
        } catch {
          setTorchAvailable(false);
        }
        setStatus("scanning");
      } catch (error) {
        if (cancelled) return;
        const name = error instanceof Error ? error.name : "";
        if (name === "NotAllowedError" || name === "SecurityError") setStatus("denied");
        else if (name === "NotFoundError" || name === "OverconstrainedError") setStatus("nocamera");
        else {
          setStatus("error");
          setDetail(error instanceof Error ? error.message : "The camera could not be started.");
        }
      }
    })();

    return () => {
      cancelled = true;
      if (resumeTimerRef.current) {
        window.clearTimeout(resumeTimerRef.current);
        resumeTimerRef.current = null;
      }
      const scanner = scannerRef.current;
      scannerRef.current = null;
      if (scanner) {
        void scanner
          .stop()
          .catch(() => {})
          .finally(() => {
            try {
              scanner.clear();
            } catch {
              // Already gone.
            }
          });
      }
    };
  }, [open, readerId]);

  async function toggleTorch() {
    const scanner = scannerRef.current;
    if (!scanner) return;
    const next = !torchOn;
    try {
      await scanner.applyVideoConstraints({ advanced: [{ torch: next }] } as unknown as MediaTrackConstraints);
      setTorchOn(next);
    } catch {
      setTorchAvailable(false);
    }
  }

  return (
    <AdminModal open={open} onClose={onClose} subtitle="Till camera" title="Scan product sticker" size="lg">
      <div className="space-y-4">
        {status === "insecure" && (
          <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-900">
            Camera scanning needs a secure page. Open this till over HTTPS (or http://localhost on the till itself).
          </p>
        )}
        {status === "denied" && (
          <div role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-900">
            <p>The camera is blocked. Allow camera access, then try again.</p>
            <p className="mt-1 font-normal">
              Chrome: tap the lock (or tune) icon in the address bar → Site settings → Camera → Allow, then reopen
              this.
            </p>
          </div>
        )}
        {status === "nocamera" && (
          <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-900">
            No camera was found on this till. Type the code below instead.
          </p>
        )}
        {status === "error" && (
          <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-900">
            The camera could not start{detail ? `: ${detail}` : ". Try again or type the code below."}
          </p>
        )}

        <div className="overflow-hidden rounded-2xl border border-[var(--color-line)] bg-black">
          <div id={readerId} className="min-h-64 w-full [&_video]:w-full" />
        </div>

        {status === "scanning" && (
          <p className="text-center text-sm text-[var(--color-ink-soft)]">
            Point the camera at the sticker QR or barcode. It adds automatically — keep scanning the basket.
          </p>
        )}
        {status === "scanning" && seenCount > 0 && lastOutcome === "added" && (
          <p role="status" className="rounded-xl bg-emerald-50 px-3 py-2 text-center text-sm font-semibold text-emerald-900">
            Added — scan the next item. Codes read: {seenCount}.
          </p>
        )}
        {status === "scanning" && lastOutcome === "unmatched" && (
          <p role="alert" className="rounded-xl bg-amber-50 px-3 py-2 text-center text-sm font-semibold text-amber-900">
            Code read, but no in-stock product matches it. Close this to see the reason, or try another sticker.
          </p>
        )}

        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => void toggleTorch()}
            disabled={!torchAvailable}
            className="admin-button admin-button-secondary min-h-11 text-xs disabled:opacity-40"
          >
            {torchOn ? <FlashlightOff size={15} /> : <Flashlight size={15} />}
            {torchOn ? "Torch off" : "Torch on"}
          </button>
          <button type="button" onClick={onClose} className="admin-button min-h-11 text-xs">
            <X size={15} /> Done scanning
          </button>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (manual.trim()) {
              const added = onDecodeRef.current(manual) === true;
              setSeenCount((count) => count + 1);
              setLastOutcome(added ? "added" : "unmatched");
              if (added) setManual("");
            }
          }}
          className="rounded-2xl border border-[var(--color-line)] p-3"
        >
          <label htmlFor={`${readerId}-manual`} className="flex items-center gap-2 text-xs font-bold">
            <Keyboard size={14} /> No camera? Type the code
          </label>
          <div className="mt-2 flex gap-2">
            <input
              id={`${readerId}-manual`}
              value={manual}
              onChange={(event) => setManual(event.target.value)}
              className="admin-input min-h-11"
              placeholder="SKU or full QR text…"
              autoComplete="off"
            />
            <button type="submit" className="admin-button min-h-11 shrink-0 px-4 text-xs">
              Add
            </button>
          </div>
        </form>

        <p className="flex items-center justify-center gap-2 text-xs text-[var(--color-ink-soft)]">
          <Camera size={13} /> The camera stops when you close this.
        </p>
      </div>
    </AdminModal>
  );
}
