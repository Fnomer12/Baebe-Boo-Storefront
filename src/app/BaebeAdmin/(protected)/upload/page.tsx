import { redirect } from "next/navigation";

/**
 * The old "Add a product" page, kept as a redirect.
 *
 * Creating a product is a popup on the products workspace now, so there is no
 * page left here — but the route itself cannot simply go. `[workspace]/page.tsx`
 * maps the legacy `upload` alias onto it, and it has been the bookmark for
 * "add a product" for as long as the admin has existed. `?new=1` is what
 * `ProductManagement` reads to open the wizard on arrival.
 */
export default function AdminUploadPage() {
  redirect("/BaebeAdmin/products?new=1");
}
