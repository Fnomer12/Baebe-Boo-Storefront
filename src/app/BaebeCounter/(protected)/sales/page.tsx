import type { Metadata } from "next";
import CounterSalesWorkspace from "@/components/counter/CounterSalesWorkspace";

export const metadata: Metadata = {
  title: "Sales | Baebe Boo Counter",
};

export default function CounterSalesPage() {
  return <CounterSalesWorkspace />;
}
