import { Sparkles, ShoppingBag, Users, MessageSquare, Cake, Share2 } from "lucide-react";

export type RewardAccount = {
  available_points: number;
  pending_points: number;
  lifetime_points: number;
  updated_at: string | null;
};

export type RewardLedgerEntry = {
  id: string;
  entry_type: string;
  points: number;
  status: string;
  reason: string;
  created_at: string;
  order_id: string | null;
};

export type LoyaltyRule = {
  event_type: string;
  points: number;
  is_active: boolean;
};

const DEFAULT_RULES: LoyaltyRule[] = [
  { event_type: "purchase", points: 1, is_active: true },
  { event_type: "referral", points: 500, is_active: true },
  { event_type: "review", points: 200, is_active: true },
  { event_type: "birthday", points: 300, is_active: true },
  { event_type: "social_share", points: 50, is_active: true },
];

const RULE_META: Record<
  string,
  { icon: typeof Sparkles; title: string; getDescription: (points: number) => string }
> = {
  purchase: {
    icon: ShoppingBag,
    title: "Purchases",
    getDescription: (points) => `Earn ${points} point${points === 1 ? "" : "s"} per paid GH₵1 in merchandise.`,
  },
  referral: {
    icon: Users,
    title: "Referrals",
    getDescription: (points) => `Invite another family and earn ${points.toLocaleString("en-GH")} points when they qualify.`,
  },
  review: {
    icon: MessageSquare,
    title: "Reviews",
    getDescription: (points) => `Share verified-purchase feedback for ${points.toLocaleString("en-GH")} points.`,
  },
  birthday: {
    icon: Cake,
    title: "Birthdays",
    getDescription: (points) => `Celebrate with ${points.toLocaleString("en-GH")} bonus points on your special day.`,
  },
  social_share: {
    icon: Share2,
    title: "Social shares",
    getDescription: (points) => `Spread the word and collect ${points.toLocaleString("en-GH")} extra points.`,
  },
};

export default function RewardsDashboard({
  account,
  ledger,
  rules = DEFAULT_RULES,
}: {
  account: RewardAccount | null;
  ledger: RewardLedgerEntry[];
  rules?: LoyaltyRule[];
}) {
  return (
    <div className="mt-9 space-y-8">
      <section className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Available" value={account?.available_points ?? 0} icon={Sparkles} tone="sky" />
        <StatCard label="Lifetime" value={account?.lifetime_points ?? 0} icon={Sparkles} tone="green" />
        <StatCard label="Pending" value={account?.pending_points ?? 0} icon={Sparkles} tone="amber" />
      </section>

      <section className="rounded-3xl bg-[var(--color-cream)] p-6">
        <h2 className="text-lg font-semibold">Recent activity</h2>
        {ledger.length ? (
          <div className="mt-5 overflow-hidden rounded-2xl bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-black/10 text-left text-xs uppercase tracking-[0.16em] text-black/40">
                  <th className="px-4 py-3 font-semibold">Reason</th>
                  <th className="px-4 py-3 font-semibold">Points</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="hidden px-4 py-3 font-semibold sm:table-cell">Date</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((entry) => (
                  <tr key={entry.id} className="border-b border-black/5 last:border-b-0">
                    <td className="px-4 py-3 font-medium">{entry.reason}</td>
                    <td className={`px-4 py-3 font-semibold ${entry.points > 0 ? "text-green-700" : "text-red-700"}`}>
                      {entry.points > 0 ? "+" : ""}
                      {entry.points.toLocaleString("en-GH")}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-full bg-black/5 px-2.5 py-1 text-xs font-semibold capitalize text-black/60">
                        {entry.status}
                      </span>
                    </td>
                    <td className="hidden px-4 py-3 text-black/50 sm:table-cell">
                      {new Date(entry.created_at).toLocaleDateString("en-GH")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-4 text-sm text-black/55">No reward activity yet. Start earning with your next purchase.</p>
        )}
      </section>

      <section className="rounded-3xl bg-[var(--color-brand-tint)] p-6">
        <h2 className="text-lg font-semibold">Ways to earn</h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(rules.length ? rules : DEFAULT_RULES)
            .filter((rule) => rule.is_active)
            .map((rule) => {
              const meta = RULE_META[rule.event_type] ?? {
                icon: Sparkles,
                title: rule.event_type.replaceAll("_", " "),
                getDescription: (points) => `Earn ${points.toLocaleString("en-GH")} points.`,
              };
              return (
                <WaysToEarnCard
                  key={rule.event_type}
                  icon={meta.icon}
                  title={meta.title}
                  description={meta.getDescription(rule.points)}
                />
              );
            })}
        </div>
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: typeof Sparkles;
  tone: "sky" | "green" | "amber";
}) {
  const toneClasses = {
    sky: "bg-[var(--color-brand-tint)] text-[var(--color-brand-deep)]",
    green: "bg-green-100 text-green-800",
    amber: "bg-amber-100 text-amber-800",
  };

  return (
    <div className="rounded-3xl bg-white p-5 shadow-sm">
      <div className={`inline-flex rounded-full p-2.5 ${toneClasses[tone]}`}>
        <Icon size={20} />
      </div>
      <p className="mt-5 text-3xl font-semibold">{value.toLocaleString("en-GH")}</p>
      <p className="mt-1 text-sm text-black/50">{label} points</p>
    </div>
  );
}

function WaysToEarnCard({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Sparkles;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-4 rounded-2xl bg-white p-4">
      <div className="rounded-full bg-[var(--color-brand-tint)] p-2.5 text-[var(--color-brand-deep)]">
        <Icon size={18} />
      </div>
      <div>
        <p className="font-semibold">{title}</p>
        <p className="mt-1 text-xs leading-5 text-black/55">{description}</p>
      </div>
    </div>
  );
}
