import { BRAND } from "@/domain/brand";
import { formatCedis } from "@/domain/money";

/**
 * Every call-to-action used to be hard-coded to `https://baebeeboo.com`, which
 * is not the domain this deployment serves. A receipt whose "Track your order"
 * button leaves the site is worse than one with no button at all.
 */
function siteUrl(path = ""): string {
  const origin = (
    process.env.NEXT_PUBLIC_SITE_URL || "https://baebeboo.com"
  ).replace(/\/+$/, "");
  return `${origin}${path}`;
}

/**
 * Where a customer can open their receipt in a browser.
 *
 * Deliberately the PUBLIC `/receipt` route rather than `/account/orders`.
 * Guest checkout is real — `orders.customer_user_id` is nullable — and
 * `/account/[section]` redirects anyone without a session to the login page,
 * so the old CTA sent guests to a wall for an account they do not have. This
 * route is authorised by order number plus the checkout email, which is the
 * customer's own address arriving in their own mailbox.
 *
 * The pair is effectively a bearer credential, but that capability already
 * exists and is already public: `/orders/track` hands out the same form. A
 * signed, expiring token is the proper upgrade when someone wants one.
 */
export function publicReceiptUrl(orderNumber: string, email: string): string {
  return siteUrl(
    `/receipt?order=${encodeURIComponent(orderNumber)}&email=${encodeURIComponent(email)}`,
  );
}

/** Emails render as raw HTML, so anything customer-supplied has to be escaped. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Plus Jakarta Sans is the brand face and Apple Mail honours the webfont link
 * in `wrap`; everything else falls through this stack.
 *
 * `system-ui` is deliberately absent from the front: Outlook's Word engine
 * resolves it to Times New Roman, which is how a "modern" stack ends up
 * rendering a serif receipt on the one client least able to cope.
 */
const FONT =
  "'Plus Jakarta Sans','Segoe UI',Roboto,'Helvetica Neue',Helvetica,Arial,sans-serif";

/**
 * The logo, sized for the header.
 *
 * The asset is 162x240 and is displayed at exactly a third of that, so it stays
 * sharp on retina without shipping more bytes than an email header deserves.
 * See `scripts/build-email-logo.mjs` for how it is derived.
 */
const LOGO = { path: "/logo-email.png", width: 54, height: 80 } as const;

// Outlook does not reliably inherit `font-family` from `<body>`, so every
// text-bearing element carries its own. `mso-line-height-rule:exactly` stops
// Word inflating every line by about 20%.
const TEXT = `margin:0 0 16px;font-family:${FONT};font-size:16px;line-height:1.6;mso-line-height-rule:exactly;color:${BRAND.ink};`;
const TEXT_MUTED = `margin:0 0 16px;font-family:${FONT};font-size:14px;line-height:1.6;mso-line-height-rule:exactly;color:${BRAND.inkSoft};`;
const TEXT_LEAD = `margin:0 0 16px;font-family:${FONT};font-size:18px;line-height:1.5;mso-line-height-rule:exactly;font-weight:700;letter-spacing:-0.01em;color:${BRAND.ink};`;

/**
 * How a customer reaches a human, built from whatever is actually configured.
 *
 * Renders nothing rather than something broken. The receipt used to print
 * `hello@baebeboo.com` unconditionally while every message went out from
 * `no-reply@` with no `Reply-To` at all — so replies vanished, and the address
 * on the page was a promise the shop was not keeping. Printing an address is
 * now conditional on someone having configured one that can receive mail.
 */
function supportLine(): string {
  const parts: string[] = [];

  const replyTo = process.env.EMAIL_REPLY_TO?.trim();
  if (replyTo) {
    parts.push("Just reply to this email and our team will help.");
  }

  // Read at request time, not build time. `NEXT_PUBLIC_*` is inlined by the
  // bundler, so a number set after the last build would never appear — and
  // `NEXT_PUBLIC_WHATSAPP_NUMBER` is in fact absent from `.env.production`
  // today. The public var stays as a fallback for existing deployments.
  const whatsapp = (
    process.env.SUPPORT_WHATSAPP_NUMBER || process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || ""
  ).replace(/\D/g, "");
  if (whatsapp) {
    parts.push(
      `<a href="https://wa.me/${whatsapp}" style="color:${BRAND.brandDeep};text-decoration:underline;">Message us on WhatsApp</a>`,
    );
  }

  if (parts.length === 0) return "";
  return `<p style="margin:0;font-family:${FONT};font-size:12px;line-height:1.6;color:${BRAND.inkSoft};">${parts.join(" &nbsp;·&nbsp; ")}</p>`;
}

/**
 * The shell every transactional email is poured into.
 *
 * `preheader` is the line inboxes show next to the subject. It is optional so
 * all existing callers keep compiling, but every template supplies one — the
 * default is Gmail showing the first words of the body, which is usually
 * "Hi there,".
 */
function wrap(title: string, body: string, preheader = ""): string {
  const origin = siteUrl();
  return `<!doctype html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="x-apple-disable-message-reformatting" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
    <title>${escapeHtml(title)}</title>
    <!--[if !mso]><!-->
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap" />
    <!--<![endif]-->
    <style>
      :root { color-scheme: light; supported-color-schemes: light; }
      body, table, td, a { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
      table { border-collapse:collapse; }
      img { border:0; line-height:100%; outline:none; text-decoration:none; -ms-interpolation-mode:bicubic; }
      a { color:${BRAND.brandDeep}; }
      @media only screen and (max-width:600px) {
        .bb-pad { padding-left:20px !important; padding-right:20px !important; }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background-color:${BRAND.cream};font-family:${FONT};color:${BRAND.ink};">
    <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${BRAND.cream};">${escapeHtml(preheader)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${BRAND.cream}" style="background-color:${BRAND.cream};">
      <tr>
        <td align="center" style="padding:40px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${BRAND.surface}" style="max-width:560px;background-color:${BRAND.surface};border-radius:24px;overflow:hidden;border:1px solid ${BRAND.lineOnSurface};">
            <tr>
              <td height="4" bgcolor="${BRAND.brand}" style="height:4px;line-height:4px;font-size:0;background-color:${BRAND.brand};">&nbsp;</td>
            </tr>
            <tr>
              <td class="bb-pad" align="center" style="padding:32px 32px 20px;background-color:${BRAND.surface};">
                <img src="${origin}${LOGO.path}" width="${LOGO.width}" height="${LOGO.height}" alt="" role="presentation" style="display:block;margin:0 auto 14px;width:${LOGO.width}px;height:${LOGO.height}px;border:0;outline:none;text-decoration:none;" />
                <h1 style="margin:0;font-family:${FONT};font-size:26px;line-height:1.2;font-weight:800;letter-spacing:-0.03em;color:${BRAND.ink};">Baebe Boo</h1>
                <p style="margin:6px 0 0;font-family:${FONT};font-size:11px;line-height:1.5;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${BRAND.brandDeep};">Premium baby &amp; family essentials</p>
              </td>
            </tr>
            <tr>
              <td class="bb-pad" style="padding:4px 32px 32px;font-family:${FONT};color:${BRAND.ink};">
                ${body}
              </td>
            </tr>
            <tr>
              <td class="bb-pad" bgcolor="${BRAND.cream}" style="padding:24px 32px 28px;background-color:${BRAND.cream};border-top:1px solid ${BRAND.lineOnCream};text-align:center;font-family:${FONT};font-size:12px;line-height:1.6;color:${BRAND.inkSoft};">
                <p style="margin:0 0 4px;font-weight:700;color:${BRAND.ink};">Baebe Boo Family Store</p>
                <p style="margin:0 0 12px;">Accra, Ghana</p>
                ${supportLine()}
                <p style="margin:12px 0 0;"><a href="${origin}/store" style="color:${BRAND.brandDeep};text-decoration:underline;">${origin.replace(/^https?:\/\//, "")}</a></p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/**
 * The primary call to action.
 *
 * A table cell rather than a padded inline `<a>`: Outlook's Word engine drops
 * padding on inline anchors, so the old `display:inline-block` pill rendered
 * there as bare underlined text with no button around it at all.
 *
 * Filled with ink, not rose. White on `BRAND.brand` is 2.99:1, which fails
 * every contrast threshold there is; white on ink is 17.95:1, and it matches
 * every primary control on the storefront.
 */
function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
      <tr>
        <td align="center" bgcolor="${BRAND.ink}" style="border-radius:9999px;background-color:${BRAND.ink};">
          <a href="${escapeHtml(href)}" style="display:inline-block;padding:15px 32px;font-family:${FONT};font-size:15px;font-weight:700;line-height:1;color:#ffffff;text-decoration:none;border-radius:9999px;">${label}</a>
        </td>
      </tr>
    </table>`;
}

/** A secondary action, for when there is already a primary button on the page. */
function textLink(href: string, label: string): string {
  return `<a href="${escapeHtml(href)}" style="color:${BRAND.brandDeep};text-decoration:underline;font-weight:600;">${label}</a>`;
}

export function welcomeTemplate(name?: string): { subject: string; html: string } {
  const greeting = name ? `Hi ${escapeHtml(name)},` : "Hi there,";
  const body = `
    <p style="${TEXT}">${greeting}</p>
    <p style="${TEXT}">Welcome to the Baebe Boo family. We are delighted to help you find beautiful, practical pieces for your little ones.</p>
    <p style="text-align:center;margin:32px 0;">${button(siteUrl("/store"), "Start shopping")}</p>
    <p style="${TEXT_MUTED}">Earn 1 point for every GH₵1 you spend and redeem rewards on future orders.</p>
  `;
  return {
    subject: "Welcome to Baebe Boo",
    html: wrap(
      "Welcome to Baebe Boo",
      body,
      "Everything baby and child, delivered across Ghana.",
    ),
  };
}

/**
 * The birthday campaign email.
 *
 * This template is deliberately written with `{{tokens}}` rather than
 * interpolated arguments. It used to take `childName`/`parentName` — and the
 * send route called it as `birthdayTemplate()`, with nothing — so every parent
 * in the country received the same "A birthday is coming up!" with no name in
 * it, while `campaign_recipients.metadata` sat there holding the child's name
 * for a substitution step that had nothing to substitute into.
 *
 * Keeping the values out means one rendering path for everything: the campaign
 * send, the cron, the admin preview and the "send test to me" button all
 * produce the identical email, because they all go through
 * `personalize(template, tokens)`. Tokens are listed for the admin in
 * `CAMPAIGN_TOKENS`. The preheader is tokenised too — `personalize` runs over
 * the whole HTML string, so the hidden preview line is substituted like
 * anything else.
 */
export function birthdayTemplate(): { subject: string; html: string } {
  const body = `
    <p style="${TEXT}">Hi {{parent_name}},</p>
    <p style="${TEXT_LEAD}">{{child_name}}’s birthday is {{birthday_countdown}}!</p>
    <p style="${TEXT}">We have added birthday points to your rewards wallet and picked a few ideas to help you celebrate {{child_name}} in style.</p>
    <p style="text-align:center;margin:32px 0;">${button(siteUrl("/store"), "Shop birthday gifts")}</p>
    <p style="${TEXT_MUTED}">Happy celebrating from all of us at Baebe Boo.</p>
  `;
  return {
    // Plain text, not HTML: no entities here or the inbox shows them literally.
    subject: "{{child_name}}'s birthday is {{birthday_countdown}} 🎂",
    html: wrap(
      "Happy birthday from Baebe Boo",
      body,
      "{{child_name}}'s big day is {{birthday_countdown}} — here are a few ideas.",
    ),
  };
}

export type PostPurchaseItem = {
  productName: string;
  quantity: number;
  /** Per-unit price. Absent for callers that only know name and quantity. */
  unitPrice?: number;
  /** Quantity times unit price, as the order recorded it. */
  lineTotal?: number;
};

export type PostPurchaseOrder = {
  orderNumber?: string;
  customerName?: string;
  items?: readonly PostPurchaseItem[];
  /** Sum of the lines, before discount and delivery. */
  subtotal?: number;
  /** Promotions plus voucher credit, as a positive number. */
  discount?: number;
  deliveryFee?: number;
  total?: number;
  /** "Click-and-collect" and a shop name, or a delivery address. */
  fulfilment?: string;
  /** Where the customer can open the same receipt in a browser. */
  receiptUrl?: string;
  /** True only when a PDF actually rode along, so the copy never lies. */
  hasReceiptAttachment?: boolean;
};

/**
 * The paid-order receipt.
 *
 * THE BUG THIS FIXES
 * ------------------
 * This used to render product names, quantities and a bare total — nothing
 * else. On a real order the customer received "Baby Organic Cotton Sweater Knit
 * Jumpsuit ×1" and "Total GH₵360.75", while the item's price was GH₵395. The
 * GH₵59.25 discount and the GH₵25.00 delivery that reconcile those two numbers
 * were both invisible, so the total looked arbitrary. The web receipt showed
 * all four correctly the whole time.
 *
 * Every new field is optional, so a caller that still only knows names and
 * quantities gets exactly the old output rather than a half-built table.
 */
export function postPurchaseTemplate(
  order: PostPurchaseOrder | string = {},
): { subject: string; html: string } {
  // Older callers passed a bare order number.
  const detail: PostPurchaseOrder =
    typeof order === "string" ? { orderNumber: order } : order;

  const greeting = detail.customerName
    ? `Hi ${escapeHtml(detail.customerName)},`
    : "Hi there,";

  const items = detail.items || [];
  const lineOf = (item: PostPurchaseItem) =>
    item.lineTotal ?? (item.unitPrice ?? 0) * item.quantity;

  const subtotal =
    typeof detail.subtotal === "number"
      ? detail.subtotal
      : items.reduce((sum, item) => sum + lineOf(item), 0);
  const discount = Math.max(0, detail.discount ?? 0);
  const delivery = Math.max(0, detail.deliveryFee ?? 0);
  // Mirrors `receiptTotals` in `@/lib/orders/receipt-order` — the stored total
  // is what the customer was actually charged, so it wins whenever there is one.
  const computed = Math.max(0, subtotal - discount + delivery);
  const total =
    typeof detail.total === "number" && detail.total > 0 ? detail.total : computed;

  // Two columns, not four. At 496px of usable width a product/qty/price/total
  // table wraps badly on a 320px phone, and Outlook will not scroll it.
  const lines = items
    .map((item) => {
      const quantity = Number(item.quantity) || 0;
      const unit =
        typeof item.unitPrice === "number"
          ? `<span style="font-family:${FONT};font-size:13px;line-height:1.5;color:${BRAND.inkSoft};">${quantity} × ${formatCedis(item.unitPrice)}</span>`
          : `<span style="font-family:${FONT};font-size:13px;line-height:1.5;color:${BRAND.inkSoft};">Quantity: ${quantity}</span>`;
      const amount =
        typeof item.unitPrice === "number" || typeof item.lineTotal === "number"
          ? formatCedis(lineOf(item))
          : "";
      return `
      <tr>
        <td style="padding:10px 0;font-family:${FONT};font-size:15px;line-height:1.45;color:${BRAND.ink};">
          ${escapeHtml(item.productName)}<br />${unit}
        </td>
        <td style="padding:10px 0;font-family:${FONT};font-size:15px;line-height:1.45;font-weight:600;color:${BRAND.ink};text-align:right;white-space:nowrap;vertical-align:top;">${amount}</td>
      </tr>`;
    })
    .join("");

  const totalRow = (
    label: string,
    value: string,
    options: { strong?: boolean; accent?: boolean; rule?: boolean } = {},
  ) => `
      <tr>
        <td style="padding:${options.rule ? "12px 0 0" : "3px 0"};${options.rule ? `border-top:1px solid ${BRAND.lineOnSurface};` : ""}font-family:${FONT};font-size:${options.strong ? "18px" : "14px"};line-height:1.5;font-weight:${options.strong ? "800" : "400"};color:${options.accent ? BRAND.brandDeep : options.strong ? BRAND.ink : BRAND.inkSoft};">${label}</td>
        <td style="padding:${options.rule ? "12px 0 0" : "3px 0"};${options.rule ? `border-top:1px solid ${BRAND.lineOnSurface};` : ""}font-family:${FONT};font-size:${options.strong ? "18px" : "14px"};line-height:1.5;font-weight:${options.strong ? "800" : "400"};color:${options.accent ? BRAND.brandDeep : options.strong ? BRAND.ink : BRAND.inkSoft};text-align:right;white-space:nowrap;">${value}</td>
      </tr>`;

  // Only shown when there is line money to explain. A caller with no prices
  // still gets names, quantities and a total, exactly as before.
  const breakdown =
    subtotal > 0
      ? [
          totalRow("Subtotal", formatCedis(subtotal)),
          discount > 0
            ? totalRow("Discount", `-${formatCedis(discount)}`, { accent: true })
            : "",
          delivery > 0 ? totalRow("Delivery", formatCedis(delivery)) : "",
        ].join("")
      : "";

  // The total row is unconditional once there is a receipt block at all. It
  // used to be gated on `total > 0`, which meant an order fully covered by a
  // gift voucher — a real case, since `voucher_credit` can equal the basket —
  // rendered its items and then simply stopped, with no total anywhere. GH₵0.00
  // is a number the customer needs to see.
  const hasReceiptBlock = Boolean(lines) || subtotal > 0 || total > 0;
  const receipt = hasReceiptBlock
    ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${BRAND.brandTint}" style="margin:24px 0;background-color:${BRAND.brandTint};border-radius:16px;">
      <tr><td style="padding:18px 20px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          ${lines}
          ${breakdown}
          ${totalRow("Total", formatCedis(total), { strong: true, rule: true })}
        </table>
      </td></tr>
    </table>`
    : "";

  const attachmentNote = detail.hasReceiptAttachment
    ? `<p style="${TEXT_MUTED}">Your full receipt is attached to this email as a PDF.</p>`
    : "";

  const secondary = detail.receiptUrl
    ? `<p style="margin:20px 0 0;text-align:center;font-family:${FONT};font-size:14px;line-height:1.6;">${textLink(siteUrl("/account/orders"), "Or sign in to see all your orders")}</p>`
    : "";

  const body = `
    <p style="${TEXT}">${greeting}</p>
    <p style="${TEXT}">Thank you for shopping with Baebe Boo. Your order ${detail.orderNumber ? `<strong>#${escapeHtml(detail.orderNumber)}</strong>` : ""} has been paid for and is being prepared with care.</p>
    ${receipt}
    ${detail.fulfilment ? `<p style="margin:0 0 16px;font-family:${FONT};font-size:15px;line-height:1.6;color:${BRAND.inkSoft};">${escapeHtml(detail.fulfilment)}</p>` : ""}
    ${attachmentNote}
    <p style="text-align:center;margin:32px 0 0;">${button(detail.receiptUrl || siteUrl("/account/orders"), detail.receiptUrl ? "View your receipt" : "Track your order")}</p>
    ${secondary}
    <p style="${TEXT_MUTED}margin-top:28px;">You earned rewards points on this purchase. Sign in to your account to see your balance.</p>
  `;

  return {
    subject: detail.orderNumber
      ? `Your Baebe Boo order #${detail.orderNumber}`
      : "Thank you for your Baebe Boo order",
    html: wrap(
      "Thank you for your order",
      body,
      detail.orderNumber
        ? `Order #${detail.orderNumber} is paid and being prepared.`
        : "Your order is paid and being prepared.",
    ),
  };
}

export function reactivationTemplate(name?: string): { subject: string; html: string } {
  const greeting = name ? `Hi ${escapeHtml(name)},` : "Hi there,";
  const body = `
    <p style="${TEXT}">${greeting}</p>
    <p style="${TEXT}">We have missed you at Baebe Boo. New arrivals are waiting, and your rewards points are still in your account.</p>
    <p style="text-align:center;margin:32px 0;">${button(siteUrl("/store"), "Explore new arrivals")}</p>
    <p style="${TEXT_MUTED}">Not ready to shop? No worries — you can update your preferences anytime.</p>
  `;
  return {
    subject: "We miss you at Baebe Boo",
    html: wrap("We miss you", body, "Your rewards points are still waiting."),
  };
}

/**
 * Sign-in code email. The code is deliberately kept out of the subject line so
 * it does not surface in lock-screen previews or mail-server logs, and it is
 * rendered as text rather than a link so nothing here can create a session.
 *
 * The preheader is held to the same rule, and for the same reason: a preheader
 * is precisely what a phone shows on the lock screen next to the subject.
 */
export function loginCodeTemplate(code: string, expiryMinutes: number): { subject: string; html: string } {
  const body = `
    <p style="${TEXT}">Here is your Baebe Boo sign-in code:</p>
    <p style="margin:28px 0;text-align:center;">
      <span style="display:inline-block;padding:18px 28px;border-radius:16px;background-color:${BRAND.brandTint};border:1px solid ${BRAND.brand};font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:34px;font-weight:700;letter-spacing:0.34em;text-indent:0.34em;color:${BRAND.ink};">${escapeHtml(code)}</span>
    </p>
    <p style="${TEXT_MUTED}">It expires in ${expiryMinutes} minutes and can be used once. If you asked for more than one code, use the newest.</p>
    <p style="${TEXT_MUTED}">If you did not request this, you can ignore this email — nothing has changed on your account.</p>
  `;
  return {
    subject: "Your Baebe Boo sign-in code",
    html: wrap(
      "Your sign-in code",
      body,
      `Use it within ${expiryMinutes} minutes.`,
    ),
  };
}

/**
 * Sent instead of a code when a staff address is used on the customer form, so
 * the request does not vanish into a support black hole. It reveals nothing to
 * anyone who does not already control the mailbox.
 */
export function staffLoginRedirectTemplate(): { subject: string; html: string } {
  const body = `
    <p style="${TEXT}">Someone asked for a customer sign-in code for this address.</p>
    <p style="${TEXT}">This address is a Baebe Boo staff login, so it signs in through the staff portal instead — no customer code has been issued.</p>
    <p style="${TEXT_MUTED}">If this was not you, no action is needed.</p>
  `;
  return {
    subject: "Sign in from the Baebe Boo staff portal",
    html: wrap(
      "Staff sign-in",
      body,
      "This address signs in through the staff portal.",
    ),
  };
}
