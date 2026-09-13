"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, Check } from "lucide-react";
import {
  formatGhanaPhoneInput,
  GHANA_PHONE_ERROR,
  GHANA_PHONE_HELPER,
  normalizeGhanaPhoneCanonical,
} from "@/lib/phone";

export default function MemberForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [childName, setChildName] = useState("");
  const [childDob, setChildDob] = useState("");
  const [smsConsent, setSmsConsent] = useState(true);
  const [status, setStatus] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [phoneError, setPhoneError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = normalizeGhanaPhoneCanonical(phone);
    if (!normalized) {
      setPhoneError(GHANA_PHONE_ERROR);
      setStatus("error");
      return;
    }
    setPhoneError("");
    setStatus("saving");
    const response = await fetch("/api/family/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        parentName: name,
        email,
        phone: normalized,
        childName,
        childDateOfBirth: childDob,
        marketingConsent: true,
        smsConsent,
      }),
    });
    setStatus(response.ok ? "success" : "error");
    if (response.ok) {
      setName(""); setEmail(""); setPhone(""); setChildName(""); setChildDob(""); setSmsConsent(true);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2" aria-label="Join the Baebe Boo family">
      <label className="storefront-field"><span>Your name *</span><input required autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Ama Mensah" /></label>
      <label className="storefront-field"><span>Email address *</span><input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="ama@example.com" /></label>
      <label className="storefront-field"><span>Phone number * (SMS updates)</span><input required type="tel" inputMode="tel" autoComplete="tel" aria-describedby="family-phone-helper" value={phone} onChange={(event) => { setPhone(formatGhanaPhoneInput(event.target.value)); if (phoneError) setPhoneError(""); }} onBlur={() => { if (phone && !normalizeGhanaPhoneCanonical(phone)) setPhoneError(GHANA_PHONE_ERROR); }} placeholder="+233" /></label>
      <label className="storefront-field"><span>Child&apos;s name *</span><input required value={childName} onChange={(event) => setChildName(event.target.value)} placeholder="First and last name" /></label>
      <p id="family-phone-helper" className="text-xs leading-5 text-white/70 sm:col-span-2 -mt-1">{GHANA_PHONE_HELPER}</p>
      {phoneError ? <p role="alert" className="text-sm font-semibold text-red-300 sm:col-span-2">{phoneError}</p> : null}
      <label className="storefront-field sm:col-span-2"><span>Child&apos;s birthday *</span><input required type="date" value={childDob} onChange={(event) => setChildDob(event.target.value)} /></label>
      <label className="flex gap-3 py-2 text-xs leading-5 text-white/80 sm:col-span-2"><input required type="checkbox" className="mt-1 h-4 w-4" /> I agree to receive family updates and age-relevant offers. I can unsubscribe at any time.</label>
      <label className="flex gap-3 py-2 text-xs leading-5 text-white/80 sm:col-span-2"><input type="checkbox" checked={smsConsent} onChange={(event) => setSmsConsent(event.target.checked)} className="mt-1 h-4 w-4" /> Send me order updates and family offers by SMS/WhatsApp. You can opt out at any time.</label>
      <button disabled={status === "saving"} className="storefront-primary-button sm:col-span-2" type="submit">
        {status === "success" ? <><Check size={18} /> You&apos;re part of the family</> : <>{status === "saving" ? "Joining…" : "Join the family"}<ArrowRight size={18} /></>}
      </button>
      {status === "error" && <p role="alert" className="text-sm text-red-700 sm:col-span-2">We couldn&apos;t save your details just now. Please try again.</p>}
    </form>
  );
}
