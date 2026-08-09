import type { Metadata } from "next";
import DeliveryZoneManagement from "@/components/admin/DeliveryZoneManagement";

export const metadata: Metadata = {
  title: "Delivery | Baebe Boo Admin",
};

export default function AdminDeliveryPage() {
  return <DeliveryZoneManagement />;
}
