import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";

export const metadata = { title: "Authenticity promise", description: "How Baebe Boo protects product quality, payments and family data." };

export default function TrustPage() {
  const promises = ["Authentic products from accountable sources", "Paystack-hosted secure payment", "Verified-purchase reviews", "Clear branch-level stock and order tracking", "Purpose-specific privacy and marketing choices", "Helpful returns and customer support"];
  return <><Navbar /><main className="bg-[#ddf2ff] px-4 pb-20 pt-32 text-black sm:px-6"><article className="mx-auto max-w-4xl"><p className="text-xs font-semibold uppercase tracking-[.2em] text-sky-700">Trust at every step</p><h1 className="mt-4 max-w-3xl text-5xl font-semibold tracking-tight sm:text-6xl">Safe choices for your little ones.</h1><div className="mt-10 grid gap-4 sm:grid-cols-2">{promises.map((promise,index)=><section key={promise} className="rounded-3xl bg-white p-6"><span className="text-sm font-semibold text-sky-600">0{index+1}</span><h2 className="mt-5 text-xl font-semibold">{promise}</h2></section>)}</div></article></main><Footer /></>;
}
