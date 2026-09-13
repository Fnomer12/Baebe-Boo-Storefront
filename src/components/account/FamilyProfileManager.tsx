"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Cake, Loader2, Plus, Trash2, UserRound } from "lucide-react";
import { supabase } from "@/lib/supabase";

export type Child = {
  id: string;
  first_name: string | null;
  date_of_birth: string | null;
  age_range_taxonomy_id: string | null;
  created_at: string;
};

export type Profile = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  date_of_birth: string | null;
  marketing_status: string;
};

export type AgeRangeTaxonomy = {
  id: string;
  name: string;
  slug: string;
};

export default function FamilyProfileManager() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [children, setChildren] = useState<Child[]>([]);
  const [ageRanges, setAgeRanges] = useState<AgeRangeTaxonomy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [profileResponse, rangesResponse] = await Promise.all([
          fetch("/api/account/profile"),
          supabase.from("taxonomies").select("id, name, slug").eq("kind", "age_range").eq("is_active", true).order("sort_order", { ascending: true }),
        ]);
        const profileResult = (await profileResponse.json().catch(() => ({ profile: null, children: [] }))) as {
          profile?: Profile | null;
          children?: Child[];
        };
        if (!cancelled) {
          setProfile(profileResult.profile ?? null);
          setChildren(Array.isArray(profileResult.children) ? profileResult.children : []);
          setAgeRanges(rangesResponse.data ?? []);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setError("We could not load your family profile.");
          setLoading(false);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setMessage("");
    setError("");

    try {
      const response = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: form.get("fullName"),
          phone: form.get("phone"),
          dateOfBirth: form.get("dateOfBirth") || undefined,
          marketingStatus: form.get("marketingStatus"),
        }),
      });
      const result = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) {
        setError(result?.message || "We could not save your profile.");
        return;
      }
      setMessage("Profile saved.");
      router.refresh();
    } catch {
      setError("We could not reach the server. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  async function saveChild(event: FormEvent<HTMLFormElement>, childId?: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = {
      firstName: form.get("firstName") || undefined,
      dateOfBirth: form.get("dateOfBirth") || undefined,
      ageRangeTaxonomyId: form.get("ageRangeTaxonomyId") || undefined,
    };
    setPending(true);
    setMessage("");
    setError("");

    try {
      const response = await fetch(
        childId ? `/api/account/children/${childId}` : "/api/account/children",
        {
          method: childId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const result = (await response.json().catch(() => null)) as { id?: string; message?: string } | null;
      if (!response.ok) {
        setError(result?.message || "We could not save this child.");
        return;
      }
      event.currentTarget.reset();
      setMessage(childId ? "Child updated." : "Child added.");
      router.refresh();
    } catch {
      setError("We could not reach the server. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  async function deleteChild(id: string) {
    if (!window.confirm("Remove this child from your family profile?")) return;
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/account/children/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!response.ok) {
        const result = (await response.json().catch(() => null)) as { message?: string } | null;
        setError(result?.message || "We could not remove this child.");
        return;
      }
      setChildren((current) => current.filter((child) => child.id !== id));
      setMessage("Child removed.");
    } catch {
      setError("We could not reach the server. Check your connection and try again.");
    }
  }

  function ageRangeForDateOfBirth(dateOfBirth: string | null): string | null {
    if (!dateOfBirth || !ageRanges.length) return null;
    const birth = new Date(dateOfBirth);
    if (Number.isNaN(birth.getTime())) return null;
    const now = new Date();
    const months = (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth());
    const years = months / 12;

    const label =
      years < 0
        ? "preemie"
        : years < 0.25
          ? "newborn"
          : years < 0.5
            ? "0-3m"
            : years < 1
              ? "3-6m"
              : years < 1.5
                ? "6-12m"
                : years < 2
                  ? "1y"
                  : years < 3
                    ? "2y"
                    : years < 5
                      ? "3-5y"
                      : "5y";

    return (
      ageRanges.find((range) => range.slug.includes(label) || range.name.toLowerCase().includes(label.toLowerCase()))
        ?.id ?? null
    );
  }

  const inputClass = "mt-2 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm outline-none focus:border-[var(--color-brand)]";

  if (loading) {
    return (
      <div className="mt-9 flex items-center justify-center rounded-3xl bg-[var(--color-cream)] p-12">
        <Loader2 size={24} className="animate-spin text-[var(--color-brand-deep)]" />
      </div>
    );
  }

  return (
    <div className="mt-9 space-y-8">
      {error ? <p className="rounded-2xl bg-red-50 p-4 text-sm text-red-800">{error}</p> : null}
      {message ? <p className="rounded-2xl bg-green-50 p-4 text-sm text-green-800">{message}</p> : null}

      <form onSubmit={saveProfile} className="rounded-3xl border border-black/10 p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <UserRound size={22} className="text-[var(--color-brand-deep)]" />
          <h2 className="text-xl font-semibold">Parent details</h2>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-semibold">
            Full name
            <input
              className={inputClass}
              name="fullName"
              defaultValue={profile?.full_name ?? ""}
              maxLength={160}
            />
          </label>
          <label className="text-xs font-semibold">
            Phone (SMS updates)
            <input className={inputClass} name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="+233" title="Ghana number starting with +233" defaultValue={profile?.phone ?? ""} maxLength={20} />
            <span className="mt-1 block text-[11px] font-normal leading-4 text-black/50">We send order and delivery updates by SMS to this number.</span>
          </label>
          <label className="text-xs font-semibold">
            Date of birth
            <input className={inputClass} name="dateOfBirth" type="date" defaultValue={profile?.date_of_birth ?? ""} />
          </label>
          <label className="text-xs font-semibold">
            Marketing preference
            <select className={inputClass} name="marketingStatus" defaultValue={profile?.marketing_status ?? "unknown"}>
              <option value="unknown">Not specified</option>
              <option value="subscribed">Keep me updated</option>
              <option value="unsubscribed">No marketing</option>
            </select>
          </label>
        </div>
        <button
          disabled={pending}
          className="mt-6 rounded-full bg-black px-6 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save profile"}
        </button>
      </form>

      <section className="rounded-3xl bg-[var(--color-cream)] p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <Cake size={22} className="text-[var(--color-brand-deep)]" />
          <h2 className="text-xl font-semibold">Children</h2>
        </div>

        {children.length ? (
          <ul className="mt-5 space-y-3">
            {children.map((child) => (
              <li key={child.id} className="rounded-2xl bg-white p-4">
                <form
                  onSubmit={(event) => saveChild(event, child.id)}
                  className="grid gap-4 sm:grid-cols-[1fr_1fr_1fr_auto]"
                >
                  <label className="text-xs font-semibold">
                    First name
                    <input
                      className={inputClass}
                      name="firstName"
                      defaultValue={child.first_name ?? ""}
                      maxLength={100}
                    />
                  </label>
                  <label className="text-xs font-semibold">
                    Date of birth
                    <input
                      className={inputClass}
                      name="dateOfBirth"
                      type="date"
                      defaultValue={child.date_of_birth ?? ""}
                      onChange={(event) => {
                        const select = event.currentTarget.form?.elements.namedItem("ageRangeTaxonomyId") as HTMLSelectElement | undefined;
                        if (select) {
                          const match = ageRangeForDateOfBirth(event.currentTarget.value);
                          if (match) select.value = match;
                        }
                      }}
                    />
                  </label>
                  <label className="text-xs font-semibold">
                    Age range
                    <select
                      className={inputClass}
                      name="ageRangeTaxonomyId"
                      defaultValue={child.age_range_taxonomy_id ?? ageRangeForDateOfBirth(child.date_of_birth) ?? ""}
                    >
                      <option value="">Select age range</option>
                      {ageRanges.map((range) => (
                        <option key={range.id} value={range.id}>
                          {range.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="flex items-end gap-2">
                    <button
                      type="submit"
                      disabled={pending}
                      className="rounded-full bg-black px-4 py-3 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      Update
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteChild(child.id)}
                      className="rounded-full border border-black/10 bg-white px-4 py-3 text-xs font-semibold text-red-700"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-black/55">No children added yet.</p>
        )}

        <form
          onSubmit={(event) => saveChild(event)}
          className="mt-5 rounded-2xl border border-dashed border-black/15 bg-white p-4"
        >
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Plus size={16} /> Add a child
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_1fr_1fr_auto]">
            <label className="text-xs font-semibold">
              First name
              <input className={inputClass} name="firstName" maxLength={100} />
            </label>
            <label className="text-xs font-semibold">
              Date of birth
              <input
                className={inputClass}
                name="dateOfBirth"
                type="date"
                onChange={(event) => {
                  const select = event.currentTarget.form?.elements.namedItem("ageRangeTaxonomyId") as HTMLSelectElement | undefined;
                  if (select) {
                    const match = ageRangeForDateOfBirth(event.currentTarget.value);
                    if (match) select.value = match;
                  }
                }}
              />
            </label>
            <label className="text-xs font-semibold">
              Age range
              <select className={inputClass} name="ageRangeTaxonomyId">
                <option value="">Select age range</option>
                {ageRanges.map((range) => (
                  <option key={range.id} value={range.id}>
                    {range.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={pending}
                className="rounded-full bg-[var(--color-ink)] px-4 py-3 text-xs font-semibold text-white disabled:opacity-50"
              >
                Add
              </button>
            </div>
          </div>
        </form>
      </section>
    </div>
  );
}
