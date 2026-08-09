import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CustomerManagement, { mapChildErrors } from "./CustomerManagement";

afterEach(cleanup);

type Reply = { status: number; body: unknown };

const fetchMock = vi.fn();

/**
 * Replies are chosen by URL, not by call order.
 *
 * The screen fires several independent loads on mount — customers, campaigns,
 * the detail panel's tabs — and their order is an implementation detail. A
 * queue would make these tests fail for the wrong reason the first time
 * somebody adds a request.
 */
const routes: { match: RegExp; method: string; reply: Reply }[] = [];

/** Most recently registered wins, so a test can override a default. */
function route(match: RegExp, reply: Reply, method = "GET") {
  routes.unshift({ match, method, reply });
}

const CUSTOMER = {
  id: "11111111-1111-4111-8111-111111111111",
  userId: "11111111-1111-4111-8111-111111111111",
  memberCode: "BB-0001",
  parentName: "Ama Mensah",
  childName: "Kojo",
  phone: "0244000000",
  email: "ama@example.com",
  childDob: "2022-08-13",
  createdAt: "2026-01-01T00:00:00.000Z",
  hasAccount: true,
  marketingStatus: "subscribed",
  children: [{ firstName: "Kojo", dateOfBirth: "2022-08-13" }],
  loyalty: {
    availablePoints: 0,
    pendingPoints: 0,
    lifetimePoints: 0,
    paidOrders: 0,
    lifetimeSpend: 0,
  },
};

const PROFILE = {
  profile: {
    userId: CUSTOMER.id,
    email: CUSTOMER.email,
    fullName: "Ama Mensah",
    phone: "0244000000",
    dateOfBirth: null,
    marketingStatus: "subscribed",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  children: [
    {
      id: "child-1",
      firstName: "Kojo",
      dateOfBirth: "2022-08-13",
      ageRangeTaxonomyId: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      source: "profile",
    },
  ],
};

function previewPayload(recipients: Record<string, unknown>[]) {
  return {
    daysAhead: 30,
    count: recipients.length,
    recipients,
    preview: {
      subject: "Kojo's birthday is in 7 days",
      html: "<p>preview</p>",
      sampledFrom: "ama@example.com",
      unresolved: [],
    },
    tokens: [],
    emailConfigured: true,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
  routes.length = 0;

  route(/\/api\/admin\/customers$/, { status: 200, body: { customers: [CUSTOMER] } });
  route(/\/api\/admin\/campaigns$/, { status: 200, body: { campaigns: [] } });
  route(/\/profile$/, { status: 200, body: PROFILE });
  route(/\/orders$/, { status: 200, body: { orders: [] } });
  route(/\/returns$/, { status: 200, body: { returns: [] } });
  route(/\/recommendations$/, { status: 200, body: { childName: "Kojo", products: [] } });

  fetchMock.mockImplementation(async (input: string, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method || "GET").toUpperCase();
    const matched = routes.find(
      (candidate) => candidate.method === method && candidate.match.test(url),
    );
    const reply = matched?.reply || { status: 200, body: {} };
    return {
      ok: reply.status >= 200 && reply.status < 300,
      status: reply.status,
      json: async () => reply.body,
    };
  });

  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("confirm", () => true);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function openEditForm() {
  render(<CustomerManagement />);
  await userEvent.click(await screen.findByRole("button", { name: /Edit customer/i }));
  // The form does not accept a submit until the children have loaded.
  await waitFor(() =>
    expect(screen.getByRole("button", { name: /Save changes/i })).toBeEnabled(),
  );
}

describe("CustomerManagement — per-child validation errors", () => {
  it("shows the message the server returned against the child it belongs to", async () => {
    // THE BUG: PATCH /api/admin/customers/[id] answers a bad child with
    // errors: { "children.0.firstName": "…" } and the form rendered none of
    // them. The admin saw "Check the highlighted fields." with nothing
    // highlighted and no way to work out which child was wrong.
    await openEditForm();

    await userEvent.click(screen.getByRole("button", { name: /Add a child/i }));
    await userEvent.type(
      screen.getByLabelText("Child 2 date of birth"),
      "2024-03-01",
    );

    route(
      new RegExp(`/api/admin/customers/${CUSTOMER.id}$`),
      {
        status: 400,
        body: {
          message: "Check the highlighted fields.",
          errors: { "children.1.firstName": "Give the child a name." },
        },
      },
      "PATCH",
    );

    await userEvent.click(screen.getByRole("button", { name: /Save changes/i }));

    expect(await screen.findByText("Give the child a name.")).toBeInTheDocument();
    expect(screen.getByLabelText("Child 2 first name")).toHaveAttribute("aria-invalid", "true");
    // The first child is not blamed for the second child's problem.
    expect(screen.getByLabelText("Child 1 first name")).not.toHaveAttribute("aria-invalid");
    // And the form is still there, still holding what was typed.
    expect(screen.getByLabelText("Child 2 date of birth")).toHaveValue("2024-03-01");
  });

  it("puts the message on the right row when a blank row was dropped from the request", async () => {
    // Blank rows never reach the server, so the server's `children.1` is the
    // THIRD row on screen here. Attaching the message by raw index would
    // highlight a child the admin never touched.
    await openEditForm();

    await userEvent.click(screen.getByRole("button", { name: /Add a child/i }));
    await userEvent.click(screen.getByRole("button", { name: /Add a child/i }));
    await userEvent.type(screen.getByLabelText("Child 3 date of birth"), "2024-03-01");

    route(
      new RegExp(`/api/admin/customers/${CUSTOMER.id}$`),
      {
        status: 400,
        body: {
          message: "Check the highlighted fields.",
          errors: { "children.1.firstName": "Give the child a name." },
        },
      },
      "PATCH",
    );

    await userEvent.click(screen.getByRole("button", { name: /Save changes/i }));

    await screen.findByText("Give the child a name.");
    expect(screen.getByLabelText("Child 3 first name")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Child 2 first name")).not.toHaveAttribute("aria-invalid");
  });
});

describe("mapChildErrors", () => {
  it("translates a sent index back to the form row it came from", () => {
    // Rows 0 and 2 were sent; row 1 was blank and dropped.
    expect(mapChildErrors({ "children.1.firstName": "Give the child a name." }, [0, 2])).toEqual({
      "children.2.firstName": "Give the child a name.",
    });
  });

  it("attaches the create form's single-child errors to the first child row", () => {
    expect(mapChildErrors({ childDateOfBirth: "Use a date like 2022-08-05." }, [1])).toEqual({
      "children.1.dateOfBirth": "Use a date like 2022-08-05.",
    });
  });

  it("leaves every other field exactly where it was", () => {
    expect(mapChildErrors({ fullName: "Enter the parent's name.", children: "Too many." }, [])).toEqual(
      { fullName: "Enter the parent's name.", children: "Too many." },
    );
  });

  it("keeps an error it cannot place rather than dropping it", () => {
    expect(mapChildErrors({ "children.4.firstName": "Give the child a name." }, [0])).toEqual({
      "children.4.firstName": "Give the child a name.",
    });
  });
});

describe("CustomerManagement — birthday campaign preview", () => {
  async function openPreview(recipients: Record<string, unknown>[]) {
    route(/\/api\/admin\/campaigns\/preview/, { status: 200, body: previewPayload(recipients) });
    render(<CustomerManagement />);
    await userEvent.click(
      await screen.findByRole("button", { name: /Preview birthday campaign/i }),
    );
    return screen.findByRole("dialog");
  }

  const SIBLINGS = [
    {
      userId: null,
      email: "ama@example.com",
      parentName: "Ama Mensah",
      childName: "Kojo",
      childDateOfBirth: "2022-08-13",
      daysUntilBirthday: 3,
    },
    {
      userId: null,
      email: "ama@example.com",
      parentName: "Ama Mensah",
      childName: "Akua",
      childDateOfBirth: "2024-08-20",
      daysUntilBirthday: 10,
    },
    {
      userId: null,
      email: "kofi@example.com",
      parentName: "Kofi Boateng",
      childName: "Yaw",
      childDateOfBirth: "2021-08-25",
      daysUntilBirthday: 15,
    },
  ];

  it("counts families, not children", async () => {
    // THE BUG: the heading counted the candidate list, and a candidate is one
    // CHILD. Three children across two mailboxes was announced as "3 families
    // would receive this" for a send that reaches two — the recipient upsert
    // collapses the list on the address.
    const dialog = await openPreview(SIBLINGS);

    expect(within(dialog).getByText(/2 families would receive this/i)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: /Who gets it \(2\)/ })).toBeInTheDocument();
    expect(within(dialog).queryByText(/3 families/i)).not.toBeInTheDocument();
  });

  it("says why the number of children and the number of emails differ", async () => {
    const dialog = await openPreview(SIBLINGS);
    expect(within(dialog).getByText(/some of them are siblings/i)).toBeInTheDocument();
  });

  it("gives siblings distinct row keys", async () => {
    // Siblings share a mailbox, so keying the row on the email handed React two
    // rows with the same key. React warns and reconciles them as one identity,
    // which is how a re-render can show one sibling's details under the other's
    // row — on the one screen whose whole job is to be checked before a send.
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const dialog = await openPreview(SIBLINGS);
      await userEvent.click(within(dialog).getByRole("button", { name: /Who gets it/ }));

      expect(within(dialog).getByText("Kojo")).toBeInTheDocument();
      expect(within(dialog).getByText("Akua")).toBeInTheDocument();
      expect(within(dialog).getByText("Yaw")).toBeInTheDocument();

      const duplicateKeyWarning = consoleError.mock.calls.find((call) =>
        call.some((argument) => /same key|duplicate key/i.test(String(argument))),
      );
      expect(duplicateKeyWarning).toBeUndefined();
    } finally {
      consoleError.mockRestore();
    }
  });

  it("counts one family as one family", async () => {
    const dialog = await openPreview([SIBLINGS[0]!]);
    expect(within(dialog).getByText(/1 family would receive this/i)).toBeInTheDocument();
    expect(within(dialog).queryByText(/siblings/i)).not.toBeInTheDocument();
  });
});
