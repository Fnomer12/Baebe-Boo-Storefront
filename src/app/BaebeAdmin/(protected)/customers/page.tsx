import type { Metadata } from "next";
import CustomerManagement from "@/components/admin/CustomerManagement";

export const metadata: Metadata = {
  title: "Customers | Baebe Boo Admin",
};

export default function AdminCustomersPage() {
  return <CustomerManagement />;
}
