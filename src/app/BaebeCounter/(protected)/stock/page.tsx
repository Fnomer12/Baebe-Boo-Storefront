import type { Metadata } from "next";
import CounterStockWorkspace from "@/components/counter/CounterStockWorkspace";

export const metadata: Metadata = {
  title: "Stock | Baebe Boo Counter",
};

export default function CounterStockPage() {
  return <CounterStockWorkspace />;
}
