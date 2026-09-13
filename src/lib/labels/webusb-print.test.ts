import { describe, expect, it } from "vitest";
import {
  base64ToBytes,
  buildClaimedMessage,
  deviceLabel,
  getUsbEnvironment,
  listBulkOutRoutes,
  pickBulkOutEndpoint,
  rawUsbErrorName,
  sendRawUsbJob,
  toFriendlyUsbError,
  UsbError,
  XPRINTER_USB_ID,
  ZADIG_URL,
  type UsbPrinterDevice,
} from "./webusb-print";

function mockDevice(overrides: Partial<UsbPrinterDevice> = {}): UsbPrinterDevice & {
  written: Uint8Array[];
  claimed: number[];
} {
  const written: Uint8Array[] = [];
  const claimed: number[] = [];
  const device = {
    vendorId: 0x1fc9,
    productId: 0x2016,
    productName: "XP-365B",
    serialNumber: "ABC123",
    opened: false,
    configuration: {
      configurationValue: 1,
      interfaces: [
        {
          interfaceNumber: 0,
          alternate: {
            interfaceClass: 7,
            endpoints: [{ endpointNumber: 1, direction: "out", packetSize: 64 }],
          },
        },
      ],
    },
    selectConfiguration: async () => {},
    claimInterface: async (iface: number) => {
      claimed.push(iface);
    },
    releaseInterface: async () => {},
    transferOut: async (_endpoint: number, data: BufferSource) => {
      const bytes = new Uint8Array(data as ArrayBuffer);
      written.push(bytes);
      return { bytesWritten: bytes.byteLength, status: "ok" };
    },
    written,
    claimed,
    ...overrides,
  } as unknown as UsbPrinterDevice & { written: Uint8Array[]; claimed: number[] };
  device.open = async () => {
    device.opened = true;
  };
  device.close = async () => {
    device.opened = false;
  };
  return device;
}

describe("webusb-print", () => {
  it("picks the first OUT endpoint", () => {
    const route = pickBulkOutEndpoint({
      configurationValue: 1,
      interfaces: [
        {
          interfaceNumber: 2,
          alternate: {
            interfaceClass: 7,
            endpoints: [
              { endpointNumber: 130, direction: "in", packetSize: 64 },
              { endpointNumber: 1, direction: "out", packetSize: 64 },
            ],
          },
        },
      ],
    });
    expect(route).toEqual({ interfaceNumber: 2, endpointNumber: 1, packetSize: 64 });
  });

  it("returns null when nothing is writable", () => {
    expect(pickBulkOutEndpoint(null)).toBeNull();
    expect(
      pickBulkOutEndpoint({
        configurationValue: 1,
        interfaces: [
          {
            interfaceNumber: 0,
            alternate: { interfaceClass: 7, endpoints: [{ endpointNumber: 5, direction: "in", packetSize: 64 }] },
          },
        ],
      }),
    ).toBeNull();
  });

  it("labels devices with VID:PID for the setup UI", () => {
    const device = mockDevice();
    expect(deviceLabel(device)).toContain("1fc9:2016");
    expect(deviceLabel(device)).toContain("XP-365B");
  });

  it("decodes server base64 jobs", () => {
    const bytes = base64ToBytes(Buffer.from("SIZE 30 mm,50 mm\n", "ascii").toString("base64"));
    expect(new TextDecoder().decode(bytes)).toContain("SIZE 30 mm");
  });

  it("chunks writes by packet size and claims interface 0", async () => {
    const device = mockDevice();
    const payload = new Uint8Array(150).fill(0x41);
    const jobId = await sendRawUsbJob(device, payload);
    expect(jobId.startsWith("usb-")).toBe(true);
    expect(device.claimed).toContain(0);
    expect(device.written.length).toBe(3); // 64 + 64 + 22
    const total = device.written.reduce((sum, chunk) => sum + chunk.length, 0);
    expect(total).toBe(150);
  });

  it("rejects empty and oversized jobs before touching USB", async () => {
    const device = mockDevice();
    await expect(sendRawUsbJob(device, new Uint8Array(0))).rejects.toThrow(/empty/i);
    await expect(sendRawUsbJob(device, new Uint8Array(12 * 1024 * 1024 + 1))).rejects.toThrow(/too large/i);
    expect(device.written.length).toBe(0);
  });

  it("names a driver-claimed interface instead of blaming the prompt", () => {
    const err = toFriendlyUsbError(new DOMException("Access denied.", "SecurityError"), "claim");
    expect(err).toBeInstanceOf(UsbError);
    expect(err.kind).toBe("claimed");
    expect(err.message).toMatch(/OS driver/i);
  });

  it("points Windows tills at the Zadig rebind, others at the connector", () => {
    expect(buildClaimedMessage(true)).toMatch(/zadig/i);
    expect(buildClaimedMessage(true)).toMatch(/only through the app/i);
    expect(buildClaimedMessage(false)).toMatch(/connector app/i);
    expect(ZADIG_URL).toBe("https://zadig.akeo.ie/");
    expect(XPRINTER_USB_ID).toBe("1FC9:2016");
  });

  it("treats a dismissed picker as 'dismissed', not a block", () => {
    const err = toFriendlyUsbError(new DOMException("No device selected.", "NotFoundError"), "request");
    expect(err.kind).toBe("dismissed");
  });

  it("retries the write when this page already claimed the interface", async () => {
    const device = mockDevice({
      claimInterface: async () => {
        throw new DOMException("Already claimed.", "InvalidStateError");
      },
    });
    const jobId = await sendRawUsbJob(device, new Uint8Array([0x41]));
    expect(jobId.startsWith("usb-")).toBe(true);
    expect(device.written.length).toBe(1);
  });

  it("surfaces the claim step when another owner holds the interface", async () => {
    const device = mockDevice({
      claimInterface: async () => {
        throw new DOMException("Access denied.", "SecurityError");
      },
    });
    const failure = await sendRawUsbJob(device, new Uint8Array([0x41])).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(UsbError);
    expect((failure as UsbError).kind).toBe("claimed");
    expect((failure as UsbError).step).toBe("claim");
  });

  it("lists every writable route across interfaces", () => {
    const device = mockDevice({
      configuration: {
        configurationValue: 1,
        interfaces: [
          {
            interfaceNumber: 0,
            alternate: { interfaceClass: 7, endpoints: [{ endpointNumber: 1, direction: "out", packetSize: 64 }] },
          },
          {
            interfaceNumber: 1,
            alternate: {
              interfaceClass: 255,
              endpoints: [
                { endpointNumber: 130, direction: "in", packetSize: 64 },
                { endpointNumber: 2, direction: "out", packetSize: 512 },
              ],
            },
          },
        ],
      },
    });
    expect(listBulkOutRoutes(device)).toEqual([
      { configurationValue: 1, interfaceNumber: 0, endpointNumber: 1, packetSize: 64 },
      { configurationValue: 1, interfaceNumber: 1, endpointNumber: 2, packetSize: 512 },
    ]);
  });

  it("falls through to a free interface when the driver holds the first", async () => {
    const claimed: number[] = [];
    const device = mockDevice({
      configuration: {
        configurationValue: 1,
        interfaces: [
          {
            interfaceNumber: 0,
            alternate: { interfaceClass: 7, endpoints: [{ endpointNumber: 1, direction: "out", packetSize: 64 }] },
          },
          {
            interfaceNumber: 1,
            alternate: { interfaceClass: 255, endpoints: [{ endpointNumber: 2, direction: "out", packetSize: 64 }] },
          },
        ],
      },
      claimInterface: async (iface: number) => {
        claimed.push(iface);
        if (iface === 0) throw new DOMException("Access denied.", "SecurityError");
      },
    });
    const usedEndpoints: number[] = [];
    device.transferOut = async (endpoint: number, data: BufferSource) => {
      usedEndpoints.push(endpoint);
      const bytes = new Uint8Array(data as ArrayBuffer);
      return { bytesWritten: bytes.byteLength, status: "ok" };
    };
    const jobId = await sendRawUsbJob(device, new Uint8Array([0x41, 0x42]));
    expect(jobId.startsWith("usb-")).toBe(true);
    expect(claimed).toEqual([0, 1]);
    expect(usedEndpoints).toEqual([2]);
  });

  it("reports exact DOMException names for diagnostics", () => {
    expect(rawUsbErrorName(new DOMException("x", "SecurityError"))).toBe("SecurityError");
    expect(rawUsbErrorName(new Error("boom"))).toBe("Error");
  });

  it("reads the browser environment snapshot", () => {
    const env = getUsbEnvironment();
    expect(typeof env.supported).toBe("boolean");
    expect(typeof env.origin).toBe("string");
  });
});
