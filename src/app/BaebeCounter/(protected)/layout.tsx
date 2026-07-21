import type { ReactNode } from "react";
import { requireCounter } from "@/lib/auth";

export default async function ProtectedCounterLayout({ children }: { children: ReactNode }) {
  await requireCounter();
  return children;
}
