"use client";

/**
 * Direct USB printing via WebUSB (Chrome/Edge, HTTPS or localhost).
 *
 * Zero-install alternative to the Node printer bridge: the browser sends the
 * same raw TSPL bytes (50x30mm labels, 80mm receipts) straight to the USB
 * thermal printer. The Next.js server still builds the payload; only the
 * transport changes from `http://127.0.0.1:3210/v1/print` to `USB transferOut`.
 *
 * Known hardware: XPrinter XP-365B enumerates as VID 0x1FC9 / PID 0x2016 and
 * as USB printer class 7. Filters below cover the printer class plus common
 * XPrinter vendor IDs so staff do not need to know IDs.
 */

export type UsbTransferDirection = "in" | "out";

export type UsbEndpointDescriptor = {
  endpointNumber: number;
  direction: UsbTransferDirection;
  packetSize: number;
};

export type UsbAlternateDescriptor = {
  interfaceClass: number;
  endpoints: UsbEndpointDescriptor[];
};

export type UsbInterfaceDescriptor = {
  interfaceNumber: number;
  alternate: UsbAlternateDescriptor;
};

export type UsbConfigurationDescriptor = {
  configurationValue: number;
  interfaces: UsbInterfaceDescriptor[];
};

/** Structural minimum of WebUSB's USBDevice that we rely on (mock-friendly). */
export type UsbPrinterDevice = {
  vendorId: number;
  productId: number;
  productName?: string;
  serialNumber?: string;
  opened: boolean;
  configuration?: UsbConfigurationDescriptor | null;
  configurations?: UsbConfigurationDescriptor[];
  open: () => Promise<void>;
  close: () => Promise<void>;
  selectConfiguration: (value: number) => Promise<void>;
  claimInterface: (interfaceNumber: number) => Promise<void>;
  releaseInterface: (interfaceNumber: number) => Promise<void>;
  transferOut: (
    endpointNumber: number,
    data: BufferSource,
  ) => Promise<{ bytesWritten: number; status: string }>;
};

type UsbLike = {
  getDevices: () => Promise<UsbPrinterDevice[]>;
  requestDevice: (options: {
    filters: Array<{
      vendorId?: number;
      productId?: number;
      classCode?: number;
      subclassCode?: number;
    }>;
  }) => Promise<UsbPrinterDevice>;
};

function getUsb(): UsbLike | null {
  if (typeof navigator === "undefined") return null;
  const candidate = (navigator as unknown as { usb?: UsbLike }).usb;
  return candidate ?? null;
}

export function isWebUsbSupported(): boolean {
  return getUsb() !== null;
}

/** True on Windows tills, where usbprint.sys holds printer interfaces by default. */
export function isWindowsPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  const userAgent = navigator.userAgent || "";
  const platform =
    (navigator as unknown as { userAgentData?: { platform?: string } }).userAgentData?.platform || "";
  return /win/i.test(`${userAgent} ${platform}`);
}

export type UsbEnvironment = {
  supported: boolean;
  secureContext: boolean;
  origin: string;
};

/** Snapshot of what the browser allows, so the UI can name the real blocker. */
export function getUsbEnvironment(): UsbEnvironment {
  if (typeof window === "undefined") {
    return { supported: false, secureContext: false, origin: "" };
  }
  return {
    supported: getUsb() !== null,
    secureContext: window.isSecureContext === true,
    origin: window.location?.origin || "",
  };
}

export type UsbFailureKind =
  | "unsupported"
  | "insecure-context"
  | "dismissed"
  | "blocked"
  | "claimed"
  | "transfer"
  | "no-endpoint"
  | "unknown";

export type UsbStep = "request" | "open" | "claim" | "transfer";

export class UsbError extends Error {
  kind: UsbFailureKind;
  step: UsbStep | null;
  causeName: string;

  constructor(kind: UsbFailureKind, message: string, step: UsbStep | null = null, causeName = "") {
    super(message);
    this.name = "UsbError";
    this.kind = kind;
    this.step = step;
    this.causeName = causeName;
  }
}

/** Exact DOMException name (SecurityError, InvalidStateError, ...) for diagnostics. */
export function rawUsbErrorName(error: unknown): string {
  if (error instanceof DOMException) return error.name || "DOMException";
  if (error instanceof UsbError) return error.causeName || `UsbError:${error.kind}`;
  if (error instanceof Error) return error.name || "Error";
  return typeof error === "string" ? "string" : "unknown";
}

function unsupportedError(): UsbError {
  return new UsbError(
    "unsupported",
    "Direct USB needs Chrome or Edge on HTTPS (or localhost). Use the connector app or PDF instead.",
  );
}

function insecureContextError(): UsbError {
  return new UsbError(
    "insecure-context",
    "This page is not a secure context, so Chrome hides USB access entirely. Open the site over HTTPS (or http://localhost on the till itself) and try again.",
    "request",
  );
}

/**
 * WebUSB requires at least one filter. Printer class 7 matches most thermal
 * printers; vendor IDs cover XPrinter units that present as vendor-specific.
 */
export const PRINTER_REQUEST_FILTERS = [
  { classCode: 7 },
  { vendorId: 0x1fc9 },
  { vendorId: 0x0483 },
  { vendorId: 0x0fe6 },
  { vendorId: 0x0416 },
];

export const ZADIG_URL = "https://zadig.akeo.ie/";
export const XPRINTER_USB_ID = "1FC9:2016";

/** Testable message choice: Windows tills get the Zadig rebind path. */
export function buildClaimedMessage(isWindows: boolean): string {
  if (isWindows) {
    return "Windows gave this printer to its own printing stack, so Chrome cannot claim it — even with permission granted. Free it once with the Zadig WinUSB rebind in the guide below; after that this till prints only through the app.";
  }
  return "That USB printer is already claimed (often by the OS driver or another tab). Close other apps/tabs and try again, or use the connector app.";
}

export function toFriendlyUsbError(error: unknown, step: UsbStep | null = null): UsbError {
  if (error instanceof UsbError) return error;
  const name = rawUsbErrorName(error);
  const message = error instanceof Error ? error.message || String(error) : String(error);
  const insecure =
    typeof window !== "undefined" && typeof window.isSecureContext === "boolean" && !window.isSecureContext;

  if (name === "NotFoundError" || /no device|no compatible|no device selected/i.test(message)) {
    return new UsbError("dismissed", "No USB printer was chosen. Click Connect USB and pick the label printer.", step || "request", name);
  }
  // Chrome reports a driver-claimed interface as SecurityError on open/claim.
  // Name the real fix (Zadig rebind on Windows) instead of blaming the
  // permission prompt the user already accepted.
  if (step === "claim" || step === "open") {
    if (insecure) return insecureContextError();
    return new UsbError("claimed", buildClaimedMessage(isWindowsPlatform()), step, name);
  }
  if (name === "SecurityError" || /security|permission|access denied/i.test(message)) {
    if (insecure) return insecureContextError();
    return new UsbError(
      "blocked",
      "The browser blocked USB access. Confirm the permission prompt, close other tabs using the printer, then reconnect. If it persists, the OS driver owns the interface — use the connector app below.",
      step,
      name,
    );
  }
  if (name === "InvalidStateError" || /claimed|in use|busy|another/i.test(message)) {
    return new UsbError(
      "claimed",
      "That USB printer is already claimed (often by the OS driver or another tab). Close other apps/tabs and try again, or use the connector app.",
      step,
      name,
    );
  }
  if (name === "NetworkError" || /transfer|stalled|endpoint/i.test(message)) {
    return new UsbError(
      "transfer",
      "The USB transfer failed mid-job. Check the cable, power, paper, then reconnect and retry.",
      step || "transfer",
      name,
    );
  }
  return new UsbError("unknown", message || "Direct USB printing failed. Reconnect the printer and try again.", step, name);
}

export async function listGrantedUsbDevices(): Promise<UsbPrinterDevice[]> {
  const usb = getUsb();
  if (!usb) throw unsupportedError();
  return usb.getDevices();
}

export async function requestUsbPrinter(): Promise<UsbPrinterDevice> {
  const usb = getUsb();
  if (!usb) throw unsupportedError();
  if (typeof window !== "undefined" && typeof window.isSecureContext === "boolean" && !window.isSecureContext) {
    throw insecureContextError();
  }
  try {
    return await usb.requestDevice({ filters: PRINTER_REQUEST_FILTERS });
  } catch (error) {
    throw toFriendlyUsbError(error, "request");
  }
}

export function deviceLabel(device: UsbPrinterDevice): string {
  const hex = (value: number) => value.toString(16).padStart(4, "0");
  const name = device.productName?.trim() || "USB printer";
  const serial = device.serialNumber ? ` · ${device.serialNumber}` : "";
  return `${name} (${hex(device.vendorId)}:${hex(device.productId)}${serial})`;
}

/** Pure helper: pick the first bulk OUT endpoint of a configuration (testable). */
export function pickBulkOutEndpoint(configuration: UsbConfigurationDescriptor | null | undefined): {
  interfaceNumber: number;
  endpointNumber: number;
  packetSize: number;
} | null {
  if (!configuration) return null;
  for (const iface of configuration.interfaces || []) {
    const outs = (iface.alternate?.endpoints || []).filter((endpoint) => endpoint.direction === "out");
    if (outs.length > 0) {
      const endpoint = outs[0];
      return {
        interfaceNumber: iface.interfaceNumber,
        endpointNumber: endpoint.endpointNumber,
        packetSize: endpoint.packetSize > 0 ? endpoint.packetSize : 64,
      };
    }
  }
  return null;
}

export type UsbRoute = {
  configurationValue: number;
  interfaceNumber: number;
  endpointNumber: number;
  packetSize: number;
};

/**
 * Every writable route on the device, in enumeration order. Printers that
 * expose several interfaces (printer class + vendor-specific) often have only
 * one claimed by the OS driver, so callers must try each route in turn.
 */
export function listBulkOutRoutes(device: Pick<UsbPrinterDevice, "configuration" | "configurations">): UsbRoute[] {
  const routes: UsbRoute[] = [];
  const seen = new Set<number>();
  const configs: UsbConfigurationDescriptor[] = [];
  if (device.configuration) configs.push(device.configuration);
  for (const config of device.configurations || []) {
    if (config !== device.configuration) configs.push(config);
  }
  for (const config of configs) {
    for (const iface of config.interfaces || []) {
      if (seen.has(iface.interfaceNumber)) continue;
      const outs = (iface.alternate?.endpoints || []).filter((endpoint) => endpoint.direction === "out");
      if (outs.length === 0) continue;
      seen.add(iface.interfaceNumber);
      routes.push({
        configurationValue: config.configurationValue,
        interfaceNumber: iface.interfaceNumber,
        endpointNumber: outs[0].endpointNumber,
        packetSize: outs[0].packetSize > 0 ? outs[0].packetSize : 64,
      });
    }
  }
  return routes;
}

function candidateConfigurations(device: UsbPrinterDevice): UsbConfigurationDescriptor[] {
  const configs: UsbConfigurationDescriptor[] = [];
  if (device.configuration) configs.push(device.configuration);
  for (const config of device.configurations || []) {
    if (config !== device.configuration) configs.push(config);
  }
  return configs;
}

async function ensureOpenAndClaimed(device: UsbPrinterDevice): Promise<{
  interfaceNumber: number;
  endpointNumber: number;
  packetSize: number;
}> {
  try {
    if (!device.opened) await device.open();
    // Some printers enumerate with no active configuration until selected.
    if (!device.configuration && device.configurations?.length) {
      await device.selectConfiguration(device.configurations[0].configurationValue);
    }
  } catch (error) {
    throw toFriendlyUsbError(error, "open");
  }
  const routes = listBulkOutRoutes(device);
  if (routes.length === 0) {
    throw new UsbError(
      "no-endpoint",
      "That USB device has no writable bulk endpoint. Pick the thermal label printer, not a hub or scanner.",
      "open",
    );
  }
  const failures: string[] = [];
  for (const route of routes) {
    if (device.configuration?.configurationValue !== route.configurationValue) {
      try {
        await device.selectConfiguration(route.configurationValue);
      } catch (error) {
        failures.push(`config ${route.configurationValue}: ${rawUsbErrorName(error)}`);
        continue;
      }
    }
    try {
      await device.claimInterface(route.interfaceNumber);
      return route;
    } catch (error) {
      // Already claimed by this page (e.g. reconnect) is fine — proceed to
      // write on it. Anything else (usually the OS driver holding that
      // interface) means trying the next interface, if the printer has one.
      if (rawUsbErrorName(error) === "InvalidStateError") return route;
      failures.push(`iface #${route.interfaceNumber}: ${rawUsbErrorName(error)}`);
    }
  }
  throw new UsbError(
    "claimed",
    isWindowsPlatform()
      ? "Windows is holding every USB interface Chrome can see" +
          (failures.length > 0 ? ` (${failures.join("; ")})` : "") +
          ". Free the printer once with the Zadig WinUSB rebind in the guide below — after that this till prints only through the app."
      : "The printer's OS driver is holding every USB interface Chrome can see" +
          (failures.length > 0 ? ` (${failures.join("; ")})` : "") +
          ", so Direct USB cannot take it. Use the connector app below — it prints through the installed driver and needs no USB permission.",
    "claim",
    failures.join("; "),
  );
}

export function base64ToBytes(jobBase64: string): Uint8Array {
  const clean = jobBase64.trim();
  if (!clean) throw new Error("The server did not return a printable job.");
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(clean, "base64"));
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/** Send raw TSPL bytes to an already-permitted device. Keeps device open for reuse. */
export async function sendRawUsbJob(device: UsbPrinterDevice, data: Uint8Array): Promise<string> {
  if (data.length === 0) throw new Error("The print job is empty.");
  if (data.length > 12 * 1024 * 1024) throw new Error("Print job is too large.");
  let route: { interfaceNumber: number; endpointNumber: number; packetSize: number };
  try {
    route = await ensureOpenAndClaimed(device);
  } catch (error) {
    throw toFriendlyUsbError(error);
  }
  const chunkSize = Math.max(1, route.packetSize || 64);
  try {
    let offset = 0;
    while (offset < data.length) {
      const chunk = data.slice(offset, offset + chunkSize);
      // transferOut requires a fresh ArrayBuffer view per chunk.
      const copy = new Uint8Array(chunk);
      const result = await device.transferOut(route.endpointNumber, copy);
      if (result.status !== "ok" || result.bytesWritten !== copy.length) {
        throw new Error(`The printer accepted ${offset + result.bytesWritten} of ${data.length} bytes before stalling.`);
      }
      offset += copy.length;
    }
  } catch (error) {
    throw toFriendlyUsbError(error, "transfer");
  }
  return `usb-${device.vendorId.toString(16)}${device.productId.toString(16)}-${Date.now()}`;
}

export async function sendBase64UsbJob(device: UsbPrinterDevice, jobBase64: string): Promise<string> {
  return sendRawUsbJob(device, base64ToBytes(jobBase64));
}

export async function releaseUsbDevice(device: UsbPrinterDevice): Promise<void> {
  for (const config of candidateConfigurations(device)) {
    const route = pickBulkOutEndpoint(config);
    if (!route) continue;
    try {
      await device.releaseInterface(route.interfaceNumber);
    } catch {
      // Best effort; closing still frees the handle.
    }
  }
  try {
    if (device.opened) await device.close();
  } catch {
    // Ignore close errors after a successful print.
  }
}

/** One-shot helper: prompt for a device, send bytes, leave handle reusable. */
export async function connectAndSendUsbJob(data: Uint8Array): Promise<{ deviceName: string; jobId: string }> {
  const device = await requestUsbPrinter();
  const jobId = await sendRawUsbJob(device, data);
  return { deviceName: deviceLabel(device), jobId };
}
