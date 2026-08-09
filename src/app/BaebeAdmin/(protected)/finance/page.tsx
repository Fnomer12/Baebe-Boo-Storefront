import type { Metadata } from "next";
import FinanceWorkspace from "@/components/admin/FinanceWorkspace";

export const metadata: Metadata = {
  title: "Finance | Baebe Boo Admin",
};

export default function FinancePage() {
  return <FinanceWorkspace />;
}
