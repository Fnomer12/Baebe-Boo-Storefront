import { afterEach, describe, expect, it, vi } from "vitest";
import { BRAND } from "@/domain/brand";
import { personalizeHtml, unresolvedTokens } from "@/domain/crm/campaign-send";
import {
  birthdayTemplate,
  loginCodeTemplate,
  postPurchaseTemplate,
  publicReceiptUrl,
  reactivationTemplate,
  staffLoginRedirectTemplate,
  welcomeTemplate,
} from "./templates";

afterEach(() => {
  vi.unstubAllEnvs();
});

const everyTemplate = () => [
  welcomeTemplate("Ama"),
  birthdayTemplate(),
  reactivationTemplate("Ama"),
  postPurchaseTemplate({ orderNumber: "BB-1001", total: 250 }),
  loginCodeTemplate("123456", 10),
  staffLoginRedirectTemplate(),
];

describe("the shared email shell", () => {
  it("never uses the legacy admin teal", () => {
    // THE BUG: `brandColor` was `#28637d`, a colour from the admin portal that
    // was never a storefront brand colour. Every customer email sent a teal
    // wordmark and a teal button while the shop was rose, and nothing connected
    // the two sets of literals well enough to notice.
    for (const { html } of everyTemplate()) {
      expect(html).not.toContain("#28637d");
      expect(html).not.toContain("#f8f5f0"); // ...and the legacy cream
      expect(html).toContain(BRAND.brand);
    }
  });

  it("renders the logo from an absolute URL so mail clients can fetch it", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://baebe-boo.example");
    expect(welcomeTemplate().html).toContain(
      'src="https://baebe-boo.example/logo-email.png"',
    );
  });

  it("gives the logo width and height attributes, because Outlook ignores CSS sizing", () => {
    const { html } = welcomeTemplate();
    expect(html).toMatch(/<img[^>]*width="54"[^>]*height="80"/);
  });

  it("keeps the wordmark as live text so the brand survives when images are blocked", () => {
    expect(welcomeTemplate().html).toContain(">Baebe Boo</h1>");
  });

  it("leaves the logo alt empty, because the wordmark beneath it already says the name", () => {
    // A non-empty alt would make a screen reader — and a blocked-image render —
    // announce "Baebe Boo" twice in a row.
    expect(welcomeTemplate().html).toMatch(/<img[^>]*alt=""/);
  });

  it("declares a light colour scheme so dark-mode clients do not invert the card", () => {
    expect(welcomeTemplate().html).toContain('name="color-scheme" content="light"');
  });

  it("puts a hidden preheader before the card so the inbox preview is not a stray greeting", () => {
    const { html } = postPurchaseTemplate({ orderNumber: "BB-1001" });
    expect(html).toContain("Order #BB-1001 is paid and being prepared.");
    // Ahead of the body, and invisible once opened.
    expect(html.indexOf("mso-hide:all")).toBeLessThan(html.indexOf("Hi there,"));
  });

  it("sets a font family on the body text, because Outlook does not inherit one", () => {
    for (const { html } of everyTemplate()) {
      expect(html).toContain("'Plus Jakarta Sans'");
    }
  });

  it("renders the call to action as a filled table cell, because Outlook drops padding on an anchor", () => {
    expect(welcomeTemplate().html).toMatch(
      new RegExp(`<td[^>]*bgcolor="${BRAND.ink}"[^>]*>\\s*<a`),
    );
  });

  it("fills the button with ink rather than rose, which is unreadable under white text", () => {
    // white on BRAND.brand is 2.99:1 — it fails every threshold there is.
    const { html } = welcomeTemplate();
    expect(html).not.toContain(`bgcolor="${BRAND.brand}" style="border-radius:9999px`);
  });
});

describe("the support line in the footer", () => {
  it("says nothing at all when no contact route is configured", () => {
    vi.stubEnv("EMAIL_REPLY_TO", "");
    vi.stubEnv("SUPPORT_WHATSAPP_NUMBER", "");
    vi.stubEnv("NEXT_PUBLIC_WHATSAPP_NUMBER", "");
    const { html } = welcomeTemplate();
    expect(html).not.toContain("Just reply to this email");
    expect(html).not.toContain("wa.me");
  });

  it("invites a reply only once a reply-to address exists to receive it", () => {
    vi.stubEnv("EMAIL_REPLY_TO", "Baebe Boo <hello@example.com>");
    expect(welcomeTemplate().html).toContain("Just reply to this email");
  });

  it("reads the WhatsApp number at request time, so it is not frozen into the build", () => {
    // NEXT_PUBLIC_* is inlined by the bundler; a number set after the last
    // build would never appear. The server-side variable wins.
    vi.stubEnv("SUPPORT_WHATSAPP_NUMBER", "+233 24 000 0000");
    expect(welcomeTemplate().html).toContain("https://wa.me/233240000000");
  });
});

describe("postPurchaseTemplate", () => {
  it("explains the total with unit price, discount and delivery", () => {
    // THE BUG, exactly as the customer met it: the email showed the item and
    // "Total GH₵360.75" with nothing to explain why that was not GH₵395.
    const { html } = postPurchaseTemplate({
      orderNumber: "BB-1786222922415-BD3C741D",
      items: [
        {
          productName: "Baby Organic Cotton Sweater Knit Jumpsuit",
          quantity: 1,
          unitPrice: 395,
          lineTotal: 395,
        },
      ],
      subtotal: 395,
      discount: 59.25,
      deliveryFee: 25,
      total: 360.75,
    });
    expect(html).toContain("GH₵395.00"); // the price they saw on the product
    expect(html).toContain("-GH₵59.25"); // why it went down
    expect(html).toContain("GH₵25.00"); // why it went up
    expect(html).toContain("GH₵360.75"); // what they actually paid
  });

  it("falls back to names, quantities and a bare total when the caller has no prices", () => {
    const { html } = postPurchaseTemplate({
      orderNumber: "BB-1001",
      total: 250,
      items: [{ productName: "Cotton Sleepsuit", quantity: 2 }],
    });
    expect(html).toContain("Cotton Sleepsuit");
    expect(html).toContain("Quantity: 2");
    expect(html).toContain("GH₵250.00");
    expect(html).not.toContain("Subtotal");
  });

  it("computes the total from the lines when the order carries none", () => {
    const { html } = postPurchaseTemplate({
      items: [{ productName: "Bib", quantity: 2, unitPrice: 35, lineTotal: 70 }],
      subtotal: 70,
      deliveryFee: 25,
    });
    expect(html).toContain("GH₵95.00");
  });

  it("never shows a negative total, however large the discount", () => {
    const { html } = postPurchaseTemplate({
      items: [{ productName: "Bib", quantity: 1, unitPrice: 35, lineTotal: 35 }],
      subtotal: 35,
      discount: 100,
    });
    expect(html).toContain("GH₵0.00");
    expect(html).not.toContain("-GH₵65.00");
  });

  it("hides the discount and delivery rows when there are none", () => {
    const { html } = postPurchaseTemplate({
      items: [{ productName: "Bib", quantity: 1, unitPrice: 35, lineTotal: 35 }],
      subtotal: 35,
      total: 35,
    });
    expect(html).toContain("Subtotal");
    expect(html).not.toContain("Discount");
    expect(html).not.toContain("Delivery");
  });

  it("still accepts a bare order number string", () => {
    const { subject, html } = postPurchaseTemplate("BB-9999");
    expect(subject).toBe("Your Baebe Boo order #BB-9999");
    expect(html).toContain("#BB-9999");
  });

  it("mentions the attached PDF only when one is attached", () => {
    // Rendering the PDF can fail, and the email still goes out. Promising an
    // attachment that is not there is worse than not mentioning it.
    expect(postPurchaseTemplate({ orderNumber: "BB-1" }).html).not.toContain(
      "attached to this email as a PDF",
    );
    expect(
      postPurchaseTemplate({ orderNumber: "BB-1", hasReceiptAttachment: true }).html,
    ).toContain("attached to this email as a PDF");
  });

  it("links the public receipt so a guest with no account is not sent to a login page", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://baebe-boo.example");
    const { html } = postPurchaseTemplate({
      orderNumber: "BB-1001",
      receiptUrl: publicReceiptUrl("BB-1001", "parent@example.com"),
    });
    expect(html).toContain(
      "https://baebe-boo.example/receipt?order=BB-1001&amp;email=parent%40example.com",
    );
    expect(html).toContain("View your receipt");
  });

  it("escapes customer-supplied text instead of injecting it as HTML", () => {
    const { html } = postPurchaseTemplate({
      customerName: "<script>alert(1)</script>",
      items: [{ productName: "<img src=x onerror=alert(1)>", quantity: 1 }],
      orderNumber: "<b>BB-1</b>",
    });
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).not.toContain("<b>BB-1</b>");
  });
});

describe("loginCodeTemplate", () => {
  it("keeps the sign-in code out of the subject line", () => {
    expect(loginCodeTemplate("492013", 10).subject).not.toContain("492013");
  });

  it("keeps the sign-in code out of the preheader, which is what shows on a lock screen", () => {
    const { html } = loginCodeTemplate("492013", 10);
    const preheader = html.slice(html.indexOf("mso-hide:all"), html.indexOf("</div>"));
    expect(preheader).not.toContain("492013");
    expect(preheader).toContain("10 minutes");
  });

  it("escapes the code rather than trusting it", () => {
    expect(loginCodeTemplate("<b>1</b>", 10).html).toContain("&lt;b&gt;1&lt;/b&gt;");
  });
});

describe("the campaign templates", () => {
  it("leaves the tokens unresolved for personalize to fill", () => {
    const { html, subject } = birthdayTemplate();
    expect(unresolvedTokens(html).sort()).toEqual([
      "{{birthday_countdown}}",
      "{{child_name}}",
      "{{parent_name}}",
    ]);
    expect(subject).toContain("{{child_name}}");
  });

  it("resolves every token once personalizeHtml has run, including in the preheader", () => {
    const filled = personalizeHtml(birthdayTemplate().html, {
      parent_name: "Ama",
      child_name: "Kofi",
      birthday_countdown: "in 3 days",
    });
    expect(unresolvedTokens(filled)).toEqual([]);
    expect(filled).toContain("Kofi’s birthday is in 3 days!");
  });
});

describe("the plain-text alternative", () => {
  it("uses real characters rather than HTML entities, so stripHtml produces readable text", () => {
    // `stripHtml` in `@/lib/email` decodes only &nbsp; &amp; &lt; &gt; — so an
    // `&times;` survived into every plaintext receipt as the literal text
    // "&times;". Templates use the real character instead.
    for (const { html } of everyTemplate()) {
      expect(html).not.toMatch(/&(times|rsquo|lsquo|mdash|ndash|hellip);/);
    }
  });
});
