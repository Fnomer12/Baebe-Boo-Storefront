import type { Metadata } from "next";
import UsbProbeWorkspace from "@/components/admin/products/UsbProbeWorkspace";

export const metadata: Metadata = {
  title: "USB Probe | Baebe Boo Admin",
};

export default function AdminUsbProbePage() {
  return <UsbProbeWorkspace />;
}
