"use client";

import { useEffect, useState } from "react";
import { ShoppingBag, Store, LogOut, ShieldCheck, MapPin } from "lucide-react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export type CounterTab = "online-purchase" | "store";

type Shop = {
  id: string;
  name: string;
  location: string;
  database_name?: string;
};

type BaebeCounterProps = {
  activeTab: CounterTab;
  setActiveTab: (tab: CounterTab) => void;
};

export default function BaebeCounter({
  activeTab,
  setActiveTab,
}: BaebeCounterProps) {
  const router = useRouter();
  const [shop, setShop] = useState<Shop | null>(null);
  const [loadingShop, setLoadingShop] = useState(true);

  useEffect(() => {
    const loadAssignedShop = async () => {
      try {
        const staffCode =
          sessionStorage.getItem("baebe_counter_staff_code") ||
          sessionStorage.getItem("baebe_pending_counter_staff_code");

        if (!staffCode) {
          setShop(null);
          return;
        }

        const { data, error } = await supabase
          .from("shop_staff")
          .select(`
            id,
            staff_code,
            shop_id,
            shops (
              id,
              name,
              location,
              database_name
            )
          `)
          .eq("staff_code", staffCode.trim().toUpperCase())
          .maybeSingle();

        if (error) {
          console.error(error.message);
          setShop(null);
          return;
        }

        const shopData = Array.isArray(data?.shops)
          ? data?.shops[0]
          : data?.shops;

        if (!shopData) {
          setShop(null);
          return;
        }

        const assignedShop: Shop = {
          id: shopData.id,
          name: shopData.name,
          location: shopData.location,
          database_name: shopData.database_name,
        };

        setShop(assignedShop);

        sessionStorage.setItem("baebe_counter_shop_id", assignedShop.id);
        sessionStorage.setItem(
          "baebe_counter_shop",
          JSON.stringify(assignedShop)
        );

        if (data?.staff_code) {
          sessionStorage.setItem("baebe_counter_staff_code", data.staff_code);
        }
      } catch {
        setShop(null);
      } finally {
        setLoadingShop(false);
      }
    };

    loadAssignedShop();
  }, []);

  const logout = async () => {
    await supabase.auth.signOut();

    sessionStorage.removeItem("baebe_counter_auth");
    sessionStorage.removeItem("baebe_counter_email");
    sessionStorage.removeItem("baebe_counter_staff_code");
    sessionStorage.removeItem("baebe_counter_staff_id");
    sessionStorage.removeItem("baebe_counter_shop_id");
    sessionStorage.removeItem("baebe_counter_shop");

    sessionStorage.removeItem("baebe_pending_counter_staff_code");
    sessionStorage.removeItem("baebe_pending_counter_staff_id");
    sessionStorage.removeItem("baebe_pending_counter_shop_id");
    sessionStorage.removeItem("baebe_pending_counter_shop");

    router.replace("/BaebeCounter/login");
  };

  return (
    <aside className="flex h-screen w-[280px] shrink-0 flex-col bg-black px-6 py-7 text-white">
      <div>
        <h1 className="text-2xl font-semibold">Baebe Counter</h1>
        <p className="mt-1 text-sm text-white/45">Store counter panel</p>

        <div className="mt-5 rounded-3xl bg-white/10 p-4">
          <div className="flex items-center gap-2">
            <MapPin size={17} />
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/45">
              Location
            </p>
          </div>

          <h2 className="mt-2 text-lg font-semibold">
            {loadingShop ? "Loading shop..." : shop?.name || "No shop assigned"}
          </h2>

          {shop?.location && (
            <p className="mt-1 text-sm text-white/45">{shop.location}</p>
          )}
        </div>
      </div>

   <nav className="mt-10 space-y-2">
  <TabButton
    label="Store"
    icon={Store}
    active={activeTab === "store"}
    onClick={() => setActiveTab("store")}
  />

  <TabButton
    label="Online Purchase"
    icon={ShoppingBag}
    active={activeTab === "online-purchase"}
    onClick={() => setActiveTab("online-purchase")}
  />
</nav>

      <div className="mt-auto">
        <div className="mb-4 rounded-3xl bg-white/10 p-4">
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} />
            <p className="text-sm font-semibold">Google Secure Login</p>
          </div>

          <p className="mt-2 text-xs leading-5 text-white/45">
            Counter staff access is locked to the assigned shop location.
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

function TabButton({
  label,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  icon: any;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-2xl px-4 py-4 text-left text-sm font-semibold transition ${
        active
          ? "bg-white text-black"
          : "text-white/55 hover:bg-white/10 hover:text-white"
      }`}
    >
      <Icon size={18} />
      {label}
    </button>
  );
}