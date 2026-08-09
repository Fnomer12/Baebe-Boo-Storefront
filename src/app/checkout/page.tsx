import type { Metadata } from "next";
import CheckoutPage from "@/components/storefront/CheckoutPage";

export const metadata: Metadata = {
  title: "Checkout",
  description: "Complete your Baebe Boo order with delivery or click-and-collect.",
};

export default function Page() {
  return <CheckoutPage />;
}
