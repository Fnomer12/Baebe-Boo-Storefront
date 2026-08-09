import type { ReactNode } from "react";
import CounterWorkspaceShell from "@/components/counter/CounterWorkspaceShell";
import { requireCounter } from "@/lib/auth";

export default async function ProtectedCounterLayout({ children }: { children: ReactNode }) {
  const { staff } = await requireCounter();

  // Display strings only. The shop id and staff id stay on the server; every
  // counter API call re-derives them from the session.
  return (
    <CounterWorkspaceShell
      identity={{
        staffName: staff.name,
        staffCode: staff.code,
        shopName: staff.shop.name,
        shopLocation: staff.shop.location,
      }}
    >
      {children}
    </CounterWorkspaceShell>
  );
}
