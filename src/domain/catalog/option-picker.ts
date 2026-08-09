/**
 * What the pickers show after a shopper taps a chip.
 *
 * `optionAvailability` constrains forwards — a value on option i is offered
 * when a live variant carries it alongside the choices on options 0..i-1 — so
 * changing an early option can leave a LATER option sitting on a value that no
 * longer exists. Pink/3M, switch to Blue, and "3M" is now struck through and
 * still selected: Add to bag then fails on a combination the page itself is
 * showing as chosen. This moves the later options along instead.
 */

import { optionKey, optionValueKey, type OptionSelection, type ProductOption } from "./product-options";
import { optionAvailability, type SelectableVariant } from "./variant-selection";

/**
 * Apply one chip tap and re-settle everything after it.
 *
 * Options BEFORE the one tapped are left exactly as they are — they constrain
 * the tapped option, not the other way round, and rewriting them would move
 * chips the shopper is looking at. Options after it keep their value when it
 * survives, and otherwise fall to the first value that is still buyable.
 *
 * When an option has no available value at all — which is what a product with
 * no variant rows looks like, including every demo product — the shopper's
 * existing choice is kept rather than reset to the first declared value. That
 * was the bug: on a product without variants, picking a colour silently threw
 * away the size.
 */
export function applyOptionChoice(
  options: readonly ProductOption[],
  variants: readonly SelectableVariant[],
  selection: OptionSelection,
  changedName: string,
  value: string,
): OptionSelection {
  const changedKey = optionKey(changedName);
  const changedIndex = options.findIndex((option) => optionKey(option.name) === changedKey);
  const resolved: OptionSelection = {};

  options.forEach((option, index) => {
    const key = optionKey(option.name);
    if (key === changedKey) {
      resolved[key] = value;
      return;
    }
    if (changedIndex >= 0 && index < changedIndex) {
      if (selection[key]) resolved[key] = selection[key];
      return;
    }

    const candidates =
      optionAvailability(options, variants, resolved).find((entry) => entry.key === key)?.values || [];
    const current = optionValueKey(selection[key]);
    const kept = candidates.find((entry) => optionValueKey(entry.value) === current);
    const firstAvailable = candidates.find((entry) => entry.available);
    const chosen = (kept?.available ? kept : firstAvailable || kept) || candidates[0];
    if (chosen) resolved[key] = chosen.value;
  });

  return resolved;
}
