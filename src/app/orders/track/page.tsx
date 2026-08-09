import { Suspense } from "react";
import Navbar from "@/components/Navbar";
import TrackOrderForm from "./TrackOrderForm";

export default function TrackOrderPage() {
  return (
    <main className="min-h-screen bg-[#F8F5F0] text-black">
      <Navbar cartCount={0} />

      <section className="px-3 pb-12 pt-24 sm:px-4 sm:pb-16 sm:pt-28 md:px-6 md:pt-32">
        <div className="mx-auto w-full max-w-3xl">
          <Suspense
            fallback={
              <div className="flex items-center justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-black/20 border-t-black" />
              </div>
            }
          >
            <TrackOrderForm />
          </Suspense>
        </div>
      </section>
    </main>
  );
}
