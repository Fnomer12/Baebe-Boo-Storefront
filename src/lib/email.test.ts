import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sendMail: vi.fn(),
  fetchMock: vi.fn(),
}));

vi.mock("nodemailer", () => ({
  default: { createTransport: () => ({ sendMail: mocks.sendMail }) },
}));

import { isEmailDeliveryConfigured, sendBulkEmail, sendEmail } from "./email";

const PDF = Buffer.from("%PDF-1.3 pretend", "utf8");

function resendBody(call = 0) {
  return JSON.parse(mocks.fetchMock.mock.calls[call][1].body as string);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: [{ id: "1" }] }) });
  mocks.sendMail.mockResolvedValue({ messageId: "1" });
  vi.stubGlobal("fetch", mocks.fetchMock);
  vi.stubEnv("EMAIL_PROVIDER", "resend");
  vi.stubEnv("RESEND_API_KEY", "re_test");
  vi.stubEnv("EMAIL_FROM", "Baebe Boo <no-reply@example.com>");
  vi.stubEnv("EMAIL_REPLY_TO", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("attachments", () => {
  it("sends a Resend attachment as base64, because that is the only encoding the API accepts", async () => {
    const result = await sendEmail("ama@example.com", "Receipt", "<p>hi</p>", {
      attachments: [{ filename: "receipt.pdf", content: PDF, contentType: "application/pdf" }],
    });

    expect(result).toEqual({ sent: true, provider: "resend" });
    expect(resendBody().attachments).toEqual([
      { filename: "receipt.pdf", content: PDF.toString("base64") },
    ]);
  });

  it("leaves the Resend body attachment-free when there is none, so ordinary mail is unchanged", async () => {
    await sendEmail("ama@example.com", "Code", "<p>hi</p>");
    expect(Object.keys(resendBody()).sort()).toEqual(["from", "html", "subject", "text", "to"]);
  });

  it("gives SendGrid the type and disposition it requires alongside the base64 content", async () => {
    vi.stubEnv("EMAIL_PROVIDER", "sendgrid");
    vi.stubEnv("SENDGRID_API_KEY", "sg_test");

    await sendEmail("ama@example.com", "Receipt", "<p>hi</p>", {
      attachments: [{ filename: "receipt.pdf", content: PDF, contentType: "application/pdf" }],
    });

    expect(resendBody().attachments).toEqual([
      {
        filename: "receipt.pdf",
        content: PDF.toString("base64"),
        type: "application/pdf",
        disposition: "attachment",
      },
    ]);
  });

  it("hands nodemailer the raw Buffer, because SMTP does its own transfer encoding", async () => {
    vi.stubEnv("EMAIL_PROVIDER", "smtp");

    await sendEmail("ama@example.com", "Receipt", "<p>hi</p>", {
      attachments: [{ filename: "receipt.pdf", content: PDF, contentType: "application/pdf" }],
    });

    const message = mocks.sendMail.mock.calls[0][0];
    expect(message.attachments[0].content).toBe(PDF);
    // Base64 here would be encoded a second time and arrive as gibberish.
    expect(message.attachments[0].content).not.toBe(PDF.toString("base64"));
  });

  it("still reports a simulated send when no provider is configured, so nothing can claim a PDF was delivered", async () => {
    vi.stubEnv("EMAIL_PROVIDER", "log");

    const result = await sendEmail("ama@example.com", "Receipt", "<p>hi</p>", {
      attachments: [{ filename: "receipt.pdf", content: PDF }],
    });

    expect(result).toEqual({ sent: true, simulated: true, provider: "log" });
    expect(mocks.fetchMock).not.toHaveBeenCalled();
    expect(isEmailDeliveryConfigured()).toBe(false);
  });
});

describe("the plain-text alternative", () => {
  it("keeps the caller's text when one is supplied", async () => {
    await sendEmail("ama@example.com", "Receipt", "<p>hi</p>", { text: "explicit" });
    expect(resendBody().text).toBe("explicit");
  });

  it("derives it from the HTML when the caller supplies none", async () => {
    await sendEmail("ama@example.com", "Receipt", "<style>p{}</style><p>Hello  there</p>");
    expect(resendBody().text).toBe("Hello there");
  });

  it("decodes the entities escapeHtml produces, so an apostrophe is not left as &#39;", async () => {
    // A customer named "N'Dri" used to read as "N&#39;Dri" in every plaintext
    // receipt, because `escapeHtml` emits the entity and this did not decode it.
    await sendEmail("ama@example.com", "Receipt", "<p>Hi N&#39;Dri &quot;quoted&quot;</p>");
    expect(resendBody().text).toBe(`Hi N'Dri "quoted"`);
  });

  it("decodes &amp; last, so an escaped entity cannot become a real tag", async () => {
    await sendEmail("ama@example.com", "Receipt", "<p>&amp;lt;script&amp;gt;</p>");
    expect(resendBody().text).toBe("&lt;script&gt;");
  });
});

describe("reply-to", () => {
  it("says nothing about replies when no address is configured", async () => {
    await sendEmail("ama@example.com", "Receipt", "<p>hi</p>");
    expect(resendBody().reply_to).toBeUndefined();
  });

  it("routes replies to the configured address, since mail is sent from no-reply", async () => {
    vi.stubEnv("EMAIL_REPLY_TO", "Baebe Boo <hello@example.com>");
    await sendEmail("ama@example.com", "Receipt", "<p>hi</p>");
    expect(resendBody().reply_to).toBe("Baebe Boo <hello@example.com>");
  });

  it("lets an explicit option win over the environment", async () => {
    vi.stubEnv("EMAIL_REPLY_TO", "env@example.com");
    await sendEmail("ama@example.com", "Receipt", "<p>hi</p>", { replyTo: "call@example.com" });
    expect(resendBody().reply_to).toBe("call@example.com");
  });
});

describe("campaign mail", () => {
  it("puts no attachments in a Resend batch body, because campaign mail is attachment-free by design", async () => {
    // There is no parameter to pass one, and that absence IS the enforcement —
    // sendResendBatch builds its own bodies and would drop anything silently.
    await sendBulkEmail(
      [{ email: "a@example.com" }, { email: "b@example.com" }],
      "Hello",
      "<p>hi</p>",
    );

    const batch = resendBody();
    expect(Array.isArray(batch)).toBe(true);
    for (const message of batch) {
      expect(message).not.toHaveProperty("attachments");
    }
  });

  it("reports a simulated bulk send rather than claiming delivery", async () => {
    vi.stubEnv("EMAIL_PROVIDER", "log");
    const result = await sendBulkEmail([{ email: "a@example.com" }], "Hello", "<p>hi</p>");
    expect(result).toEqual({ sent: true, simulated: true, count: 1, provider: "log" });
  });

  it("counts what the provider accepted rather than what was offered", async () => {
    // A partially accepted batch must not report the rest as unsent: the caller
    // stamps `sent_at` from this count and the next cron tick would mail again.
    mocks.fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: "1" }, { id: "2" }] }),
    });
    const result = await sendBulkEmail(
      [{ email: "a@example.com" }, { email: "b@example.com" }, { email: "c@example.com" }],
      "Hello",
      "<p>hi</p>",
    );
    expect(result).toEqual({ sent: true, count: 2, provider: "resend" });
  });
});

describe("failures", () => {
  it("reports the provider's complaint rather than swallowing it", async () => {
    mocks.fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ message: "Domain not verified" }),
    });
    const result = await sendEmail("ama@example.com", "Receipt", "<p>hi</p>");
    expect(result).toEqual({ sent: false, error: "Domain not verified" });
  });

  it("treats an SMTP failure as a failure, never as a silent success", async () => {
    // This once returned `{sent: true, simulated: true}` from its catch, which
    // is how a sign-in code could be "sent" to an inbox it never reached.
    vi.stubEnv("EMAIL_PROVIDER", "smtp");
    mocks.sendMail.mockRejectedValue(new Error("connect ECONNREFUSED"));
    const result = await sendEmail("ama@example.com", "Code", "<p>hi</p>");
    expect(result).toEqual({ sent: false, error: "connect ECONNREFUSED" });
  });
});
