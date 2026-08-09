import type { Metadata } from "next";
import StoreManagement from "@/components/admin/StoreManagement";

export const metadata: Metadata = { title: "Stores | Baebe Boo Admin" };

export default function AdminStoresPage() {
  return <StoreManagement />;
}
