"use client";

import {
  LayoutDashboard,
  Upload,
  Store,
  Settings,
  LogOut,
  ShieldCheck,
  Bell,
  Users,
  Search,
ReceiptText,
  ClipboardList,
  Database,
} from "lucide-react";
import { useRouter } from "next/navigation";

export type AdminTab =
  | "dashboard"
  | "upload"
  | "store"
  | "orders"
  | "database"
  | "notifications"
  | "members"
  | "settings";

type AdminPanelProps = {
  activeTab: AdminTab;
  setActiveTab: (tab: AdminTab) => void;
  notificationCount?: number;
  birthdayCount?: number;
};

export default function AdminPanel({
  activeTab,
  setActiveTab,
  notificationCount = 0,
  birthdayCount = 0,
}: AdminPanelProps) {
  const router = useRouter();

  const logout = () => {
    sessionStorage.removeItem("baebe_admin_auth");
    sessionStorage.removeItem("baebe_admin_role");
    router.replace("/BaebeAdmin/login");
  };

  return (
    <aside className="flex h-screen w-[300px] shrink-0 flex-col bg-black px-6 py-7 text-white">
      <div>
        <h1 className="text-2xl font-semibold">Baebe Boo Admin</h1>
        <p className="mt-1 text-sm text-white/45">Boss management panel</p>
      </div>

      <nav className="mt-10 space-y-2">
        <TabButton label="Dashboard" icon={LayoutDashboard} active={activeTab === "dashboard"} onClick={() => setActiveTab("dashboard")} />
        <TabButton label="Upload" icon={Upload} active={activeTab === "upload"} onClick={() => setActiveTab("upload")} />
        <TabButton label="Store" icon={Store} active={activeTab === "store"} onClick={() => setActiveTab("store")} />
        <TabButton label="Orders" icon={ClipboardList} active={activeTab === "orders"} onClick={() => setActiveTab("orders")} />
          <TabButton label="Database" icon={Database} active={activeTab === "database"} onClick={() => setActiveTab("database")} />
        <TabButton label="Notifications" icon={Bell} count={notificationCount} active={activeTab === "notifications"} onClick={() => setActiveTab("notifications")} />
        <TabButton label="Members" icon={Users} count={birthdayCount} active={activeTab === "members"} onClick={() => setActiveTab("members")} />
        <TabButton label="Settings" icon={Settings} active={activeTab === "settings"} onClick={() => setActiveTab("settings")} />
      </nav>

      <div className="mt-auto">
        <div className="mb-4 rounded-3xl bg-white/10 p-4">
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} />
            <p className="text-sm font-semibold">Secure Access</p>
          </div>
          <p className="mt-2 text-xs leading-5 text-white/45">
            Google OAuth, role checks, audit logs and protected admin actions.
          </p>
        </div>

        <button
          onClick={logout}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-white text-sm font-semibold text-black"
        >
          <LogOut size={17} />
          Logout
        </button>
      </div>
    </aside>
  );
}

function TabButton({ label, icon: Icon, active, onClick, count = 0 }: any) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center justify-between rounded-2xl px-4 py-4 text-left text-sm font-semibold transition ${
        active ? "bg-white text-black" : "text-white/55 hover:bg-white/10 hover:text-white"
      }`}
    >
      <span className="flex items-center gap-3">
        <Icon size={18} />
        {label}
      </span>

      {count > 0 && (
        <span className="rounded-full bg-pink-500 px-2 py-0.5 text-xs font-bold text-white">
          {count}
        </span>
      )}
    </button>
  );
}