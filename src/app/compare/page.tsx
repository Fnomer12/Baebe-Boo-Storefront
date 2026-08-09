import type { Metadata } from "next";
import CompareView from "@/components/storefront/CompareView";

export const metadata: Metadata = {
  title: "Compare products",
  description: "See your shortlisted baby and children essentials side by side — price, age range, sizes and availability.",
};

export default function ComparePage() {
  return <CompareView />;
}
