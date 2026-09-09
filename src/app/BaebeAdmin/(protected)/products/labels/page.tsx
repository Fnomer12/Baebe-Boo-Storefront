import type { Metadata } from "next";
import LabelPrintWorkspace from "@/components/admin/products/LabelPrintWorkspace";

export const metadata: Metadata = {
  title: "Print Labels | Baebe Boo Admin",
};

export default function AdminLabelPrintPage() {
  return <LabelPrintWorkspace />;
}
