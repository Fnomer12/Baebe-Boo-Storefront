/**
 * Re-export of the shared formatter.
 *
 * The counter's implementation was the correct one — two decimals, `en-GH` —
 * so it was promoted to `src/domain/money.ts` and every other screen now uses
 * it too. This file stays so the counter modules keep their local import and
 * the change stayed a move rather than a rewrite.
 */
export { formatCedis, formatCedisRange } from "@/domain/money";
