import { redirect } from "next/navigation";

/**
 * `/stock` is what a cashier types.
 *
 * The stock screen lives at `/BaebeCounter/stock` and the sidebar links there
 * correctly, but the short path people actually type into a till's address bar
 * was a 404 — which reads as "stock is broken" rather than "wrong URL".
 */
export default function StockRedirect() {
  redirect("/BaebeCounter/stock");
}
