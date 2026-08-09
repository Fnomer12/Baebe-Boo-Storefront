import type { Metadata } from "next";
import ParentingWorkspace from "@/components/admin/ParentingWorkspace";

export const metadata: Metadata = {
  title: "Parenting Hub | Baebe Boo Admin",
};

export default function AdminParentingPage() {
  return <ParentingWorkspace />;
}
