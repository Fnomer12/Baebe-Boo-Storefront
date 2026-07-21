import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";

export const metadata = { title: "Our story", description: "Meet Baebe Boo, Ghana's trusted destination for everything baby and child." };

export default function AboutPage() {
  return <><Navbar /><main className="bg-[#f8f5f0] px-4 pb-20 pt-32 text-black sm:px-6"><article className="mx-auto max-w-4xl rounded-[2.5rem] bg-white p-7 sm:p-12"><p className="text-xs font-semibold uppercase tracking-[.2em] text-sky-600">Our story</p><h1 className="mt-4 text-5xl font-semibold tracking-tight sm:text-6xl">Growing with Ghanaian families.</h1><p className="mt-7 text-lg leading-9 text-black/60">Baebe Boo exists to make shopping for babies and children feel simpler, warmer and more trustworthy. We carefully select authentic essentials, useful gifts and joyful finds, then support every order with local care.</p><div className="mt-10 grid gap-4 sm:grid-cols-3">{[["Authenticity","Products sourced with care."],["Guidance","Helpful choices for every stage."],["Reliability","Clear availability and support."]].map(([title,text])=><section key={title} className="rounded-3xl bg-[#f8f5f0] p-5"><h2 className="font-semibold">{title}</h2><p className="mt-2 text-sm leading-6 text-black/50">{text}</p></section>)}</div></article></main><Footer /></>;
}
