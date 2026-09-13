import { describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import ScanCameraModal, { pickScanCameraTarget, signalSaleAdded } from "./ScanCameraModal";

describe("ScanCameraModal", () => {
  it("renders nothing while closed and never touches the camera", () => {
    const { container } = render(
      <ScanCameraModal open={false} onDecode={vi.fn()} onClose={vi.fn()} />,
    );
    expect(container.innerHTML).toBe("");
    cleanup();
  });

  it("signalSaleAdded never throws, even without audio or vibration", () => {
    expect(() => signalSaleAdded()).not.toThrow();
  });
});

describe("pickScanCameraTarget", () => {
  it("prefers the back camera by label", () => {
    expect(
      pickScanCameraTarget([
        { id: "front", label: "Front Camera" },
        { id: "back", label: "Back Camera" },
      ]),
    ).toEqual({ deviceId: "back" });
  });

  it("takes the last device when no label names a back camera", () => {
    expect(pickScanCameraTarget([{ id: "only", label: "" }])).toEqual({ deviceId: "only" });
  });

  it("falls back to a facing-mode constraint on an empty list so the browser prompts", () => {
    expect(pickScanCameraTarget([])).toEqual({ facingMode: "environment" });
  });
});
