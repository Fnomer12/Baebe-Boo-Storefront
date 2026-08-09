import type { Metadata } from "next";
import SellWorkspace from "@/components/counter/SellWorkspace";

export const metadata: Metadata = {
  title: "Sell | Baebe Boo Counter",
};

export default function CounterSellPage() {
  return <SellWorkspace />;
}
