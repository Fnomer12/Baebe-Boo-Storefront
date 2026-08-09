import type { Metadata } from "next";
import CounterOrdersWorkspace from "@/components/counter/CounterOrdersWorkspace";

export const metadata: Metadata = {
  title: "Orders | Baebe Boo Counter",
};

export default function CounterOrdersPage() {
  return <CounterOrdersWorkspace />;
}
