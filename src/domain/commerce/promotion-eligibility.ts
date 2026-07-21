import type { Promotion } from "./pricing";

export type PromotionCampaign = {
  id: string;
  kind: Promotion["kind"];
  value: number;
  status: "draft" | "active" | "paused" | "expired";
  startsAt: string | null;
  endsAt: string | null;
  minimumOrderAmount: number | null;
  usageLimit: number | null;
  usageCount: number;
  perCustomerLimit: number | null;
  stackable: boolean;
};

type EligibilityResult =
  | { eligible: true; promotion: Promotion }
  | { eligible: false; reason: string };

const formatCedis = (amount: number) =>
  new Intl.NumberFormat("en-GH", { maximumFractionDigits: 2 }).format(amount);

export function evaluatePromotionEligibility(
  campaign: PromotionCampaign,
  input: { subtotal: number; now: Date; customerUsageCount?: number },
): EligibilityResult {
  if (campaign.status !== "active") {
    return { eligible: false, reason: "This promotion is not active." };
  }

  const now = input.now.getTime();
  if (campaign.startsAt && now < new Date(campaign.startsAt).getTime()) {
    return { eligible: false, reason: "This promotion has not started yet." };
  }
  if (campaign.endsAt && now >= new Date(campaign.endsAt).getTime()) {
    return { eligible: false, reason: "This promotion has expired." };
  }
  if (
    campaign.usageLimit !== null &&
    campaign.usageCount >= campaign.usageLimit
  ) {
    return {
      eligible: false,
      reason: "This promotion has reached its usage limit.",
    };
  }
  if (
    campaign.minimumOrderAmount !== null &&
    input.subtotal < campaign.minimumOrderAmount
  ) {
    return {
      eligible: false,
      reason: `This promotion requires a minimum order of GH₵${formatCedis(campaign.minimumOrderAmount)}.`,
    };
  }
  if (
    campaign.perCustomerLimit !== null &&
    (input.customerUsageCount || 0) >= campaign.perCustomerLimit
  ) {
    return {
      eligible: false,
      reason: "You have reached the use limit for this promotion.",
    };
  }

  return {
    eligible: true,
    promotion: {
      id: campaign.id,
      kind: campaign.kind,
      value: campaign.value,
      stackable: campaign.stackable,
    },
  };
}
