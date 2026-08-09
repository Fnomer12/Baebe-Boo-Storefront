import type { Metadata } from "next";
import ProcurementWorkspace from "@/components/admin/ProcurementWorkspace";

export const metadata: Metadata = {
  title: "Procurement | Baebe Boo Admin",
};

export default function ProcurementPage() {
  return <ProcurementWorkspace />;
}
