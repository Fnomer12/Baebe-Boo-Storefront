import type { Metadata } from "next";
import PromotionsWorkspace from "@/components/admin/PromotionsWorkspace";

export const metadata: Metadata = {
  title: "Promotions | Baebe Boo Admin",
};

export default function AdminPromotionsPage() {
  return <PromotionsWorkspace />;
}
