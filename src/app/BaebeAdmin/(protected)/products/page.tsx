import type { Metadata } from "next";
import ProductManagement from "@/components/admin/ProductManagement";

export const metadata: Metadata = {
  title: "Products | Baebe Boo Admin",
};

export default function AdminProductsPage() {
  return <ProductManagement />;
}
