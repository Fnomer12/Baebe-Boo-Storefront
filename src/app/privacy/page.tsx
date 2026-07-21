import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";

export const metadata = { title: "Privacy", description: "Baebe Boo privacy choices and data practices." };

export default function PrivacyPage() {
  return <><Navbar /><main className="bg-[#f8f5f0] px-4 pb-20 pt-32 text-black sm:px-6"><article className="prose mx-auto max-w-3xl rounded-[2rem] bg-white p-7 sm:p-10"><h1 className="text-4xl font-semibold">Privacy at Baebe Boo</h1><p className="mt-5 leading-8 text-black/60">We collect only the details needed to fulfil orders, support your account and provide communications you have chosen. Child age information is optional and used to improve age-appropriate guidance.</p><h2 className="mt-9 text-2xl font-semibold">Your choices</h2><p className="mt-3 leading-8 text-black/60">You can use guest checkout, limit analytics to essential storage, unsubscribe from marketing, update your profile, and request access to or deletion of eligible personal information.</p><h2 className="mt-9 text-2xl font-semibold">Payments and security</h2><p className="mt-3 leading-8 text-black/60">Payment details are handled by Paystack checkout. Baebe Boo stores order and payment references, not full card or mobile-money credentials.</p><p className="mt-9 text-sm text-black/45">Before production launch, this notice must be reviewed and approved by Baebe Boo’s responsible business and legal representatives.</p></article></main><Footer /></>;
}
