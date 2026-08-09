import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock is hoisted above the imports, so the doubles it closes over have to
// be created by vi.hoisted rather than declared as ordinary consts.
const mocks = vi.hoisted(() => ({
  upload: vi.fn(),
  getPublicUrl: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    storage: {
      from: () => ({ upload: mocks.upload, getPublicUrl: mocks.getPublicUrl }),
    },
  },
}));

import StoreManagement from "./StoreManagement";

afterEach(cleanup);

type Reply = { status: number; body: unknown };

const fetchMock = vi.fn();

const STORE_ID = "11111111-1111-4111-8111-111111111111";

function storePayload(overrides: Record<string, unknown> = {}) {
  return {
    id: STORE_ID,
    name: "Baebe Boo Sakumono",
    location: "Sakumono",
    whatsappNumber: "",
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    staff: [],
    ...overrides,
  };
}

function staffPayload(
  id: string,
  staffName: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    shopId: STORE_ID,
    staffName,
    staffContact: "",
    profileImageUrl: "",
    staffCode: `BB${id.toUpperCase()}`,
    authorizedEmail: `bb${id}@counter.baebe-boo.jtechinnovations.tech`,
    accessActive: true,
    accessConfigured: true,
    createdAt: "2026-01-02T00:00:00.000Z",
    ...overrides,
  };
}

/** Queues replies in order; the first is always the initial GET /api/admin/stores. */
function queue(...replies: Reply[]) {
  for (const reply of replies) {
    fetchMock.mockImplementationOnce(async () => ({
      ok: reply.status >= 200 && reply.status < 300,
      status: reply.status,
      json: async () => reply.body,
    }));
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("confirm", () => true);
});

async function renderWorkspace() {
  render(<StoreManagement />);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/admin/stores", expect.anything()));
  await waitFor(() =>
    expect(screen.queryByText(/Loading store management/)).not.toBeInTheDocument(),
  );
}

function lastRequestBody() {
  const call = fetchMock.mock.calls.at(-1);
  return JSON.parse(String((call?.[1] as RequestInit).body));
}

describe("StoreManagement — creating the first store", () => {
  it("offers the create form when there are no stores at all", async () => {
    // The bug: the render tree returned <AdminEmptyState> when the list was
    // empty and never reached <StoreDetail>, which was the only host of the
    // create form — and StoreDetail additionally required a selected store. So
    // the FIRST store could never be created through the UI.
    queue({ status: 200, body: { stores: [] } });
    await renderWorkspace();

    expect(screen.getByText("No stores yet")).toBeInTheDocument();

    await userEvent.click(screen.getAllByRole("button", { name: /Add store/ })[0]);

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Add a store" })).toBeInTheDocument();
    expect(within(dialog).getByRole("textbox", { name: /Store name/ })).toBeInTheDocument();
  });

  it("posts a body the create schema accepts when every optional field is blank", async () => {
    // The other half of the same bug: `databaseName: ""` was posted verbatim
    // against `z.string().trim().min(1).max(120).optional()`, so the API
    // answered 400 every single time — and leaving it blank was the normal
    // case, since nothing marked it required.
    queue(
      { status: 200, body: { stores: [] } },
      { status: 201, body: { store: storePayload({ name: "Baebe Boo Sogakope", location: "Sogakope" }) } },
    );
    await renderWorkspace();

    await userEvent.click(screen.getAllByRole("button", { name: /Add store/ })[0]);
    const dialog = screen.getByRole("dialog");
    await userEvent.type(within(dialog).getByRole("textbox", { name: /Store name/ }), "Baebe Boo Sogakope");
    await userEvent.type(within(dialog).getByRole("textbox", { name: /Location/ }), "Sogakope");
    await userEvent.click(within(dialog).getByRole("button", { name: "Create store" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe("/api/admin/stores");
    expect((init as RequestInit).method).toBe("POST");
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      name: "Baebe Boo Sogakope",
      location: "Sogakope",
      isActive: true,
    });

    await waitFor(() =>
      expect(screen.getByText("Baebe Boo Sogakope created.")).toBeInTheDocument(),
    );
  });

  it("has no database name field left to fill in", async () => {
    queue({ status: 200, body: { stores: [] } });
    await renderWorkspace();

    await userEvent.click(screen.getAllByRole("button", { name: /Add store/ })[0]);
    expect(screen.queryByRole("textbox", { name: /[Dd]atabase/ })).not.toBeInTheDocument();
  });
});

describe("StoreManagement — the create form is not an edit form", () => {
  it("opens a dialog of its own rather than the selected store's panel", async () => {
    // The create form used to render inside the selected store's detail aside,
    // under a heading naming that store and beside its Edit and Deactivate
    // buttons, which reads as editing that store.
    queue({ status: 200, body: { stores: [storePayload()] } });
    await renderWorkspace();

    await userEvent.click(screen.getAllByRole("button", { name: /^Add store$/ })[0]);

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Add a store" })).toBeInTheDocument();
    expect(within(dialog).queryByText(/Deactivate/)).not.toBeInTheDocument();
    expect(within(dialog).getByRole("textbox", { name: /Store name/ })).toHaveValue("");
  });

  it("names the store being edited when editing", async () => {
    queue({ status: 200, body: { stores: [storePayload()] } });
    await renderWorkspace();

    await userEvent.click(screen.getByRole("button", { name: "Edit Baebe Boo Sakumono" }));

    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByRole("heading", { name: "Edit Baebe Boo Sakumono" }),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole("textbox", { name: /Store name/ })).toHaveValue("Baebe Boo Sakumono");
  });
});

describe("StoreManagement — failed saves", () => {
  it("keeps everything typed and attaches the message to the field", async () => {
    queue(
      { status: 200, body: { stores: [] } },
      {
        status: 400,
        body: {
          message: "Check the highlighted details and try again.",
          errors: { whatsappNumber: "Enter a WhatsApp number with digits only, for example +233 24 000 0000." },
        },
      },
    );
    await renderWorkspace();

    await userEvent.click(screen.getAllByRole("button", { name: /Add store/ })[0]);
    const dialog = screen.getByRole("dialog");
    await userEvent.type(within(dialog).getByRole("textbox", { name: /Store name/ }), "Baebe Boo Ho");
    await userEvent.type(within(dialog).getByRole("textbox", { name: /Location/ }), "Ho");
    await userEvent.type(within(dialog).getByRole("textbox", { name: /WhatsApp/ }), "nonsense");
    await userEvent.click(within(dialog).getByRole("button", { name: "Create store" }));

    await waitFor(() =>
      expect(screen.getByText(/Enter a WhatsApp number with digits only/)).toBeInTheDocument(),
    );
    // The form must survive its own rejection — a failed submit that unmounts
    // the modal throws away everything the admin typed.
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /Store name/ })).toHaveValue("Baebe Boo Ho");
    expect(screen.getByRole("textbox", { name: /Location/ })).toHaveValue("Ho");
    expect(screen.getByRole("textbox", { name: /WhatsApp/ })).toHaveValue("nonsense");
  });
});

describe("StoreManagement — staff form", () => {
  it("has no Photo URL field competing with the upload", async () => {
    // Keeping both silently discarded the typed URL: `uploadStaffPhoto()`
    // returns it only when NO file is picked, so choosing a file threw the
    // typed address away without saying so.
    queue({ status: 200, body: { stores: [storePayload()] } });
    await renderWorkspace();

    await userEvent.click(screen.getAllByRole("button", { name: "Add staff to Baebe Boo Sakumono" })[0]);

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/Upload photo/)).toBeInTheDocument();
    expect(within(dialog).queryByRole("textbox", { name: /Photo/ })).not.toBeInTheDocument();
  });

  it("does not post an authorized email, which the server ignores anyway", async () => {
    queue(
      { status: 200, body: { stores: [storePayload()] } },
      { status: 201, body: { store: storePayload() } },
    );
    await renderWorkspace();

    await userEvent.click(screen.getAllByRole("button", { name: "Add staff to Baebe Boo Sakumono" })[0]);
    const dialog = screen.getByRole("dialog");
    await userEvent.type(within(dialog).getByRole("textbox", { name: /Staff name/ }), "Amanda");
    await userEvent.click(within(dialog).getByRole("button", { name: "Add staff member" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const body = lastRequestBody();
    expect(body).not.toHaveProperty("authorizedEmail");
    expect(body).toEqual({ staffName: "Amanda", staffContact: "", accessActive: true });
  });

  it("keeps the staff form open when the save fails", async () => {
    queue(
      { status: 200, body: { stores: [storePayload()] } },
      { status: 400, body: { message: "Check the highlighted details and try again.", errors: { staffName: "Enter the staff member's name." } } },
    );
    await renderWorkspace();

    await userEvent.click(screen.getAllByRole("button", { name: "Add staff to Baebe Boo Sakumono" })[0]);
    const dialog = screen.getByRole("dialog");
    await userEvent.type(within(dialog).getByRole("textbox", { name: /Contact/ }), "0240000000");
    await userEvent.click(within(dialog).getByRole("button", { name: "Add staff member" }));

    await waitFor(() =>
      expect(screen.getByText("Enter the staff member's name.")).toBeInTheDocument(),
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /Contact/ })).toHaveValue("0240000000");
  });

  it("explains the photo control, like every other field in the modal", async () => {
    // It was the only control in either editor not wrapped in `HintedField`,
    // and so the only one with no hint — on a form whose users are not
    // technical and whose other five fields all have one.
    queue({ status: 200, body: { stores: [storePayload()] } });
    await renderWorkspace();

    await userEvent.click(screen.getAllByRole("button", { name: "Add staff to Baebe Boo Sakumono" })[0]);

    const dialog = screen.getByRole("dialog");
    const hint = within(dialog).getByRole("button", { name: "What is Staff photo?" });
    await userEvent.click(hint);

    // The panel is portalled to `document.body` to escape the modal's
    // overflow, so it is found on `screen` rather than inside the dialog.
    expect(await screen.findByRole("tooltip")).toHaveTextContent(/beside this person's name at the till/i);
  });
});

describe("StoreManagement — the staff member just created is the one selected", () => {
  it("selects by the CounterID that was issued, not by list position", async () => {
    // The bug: the client selected `store.staff[store.staff.length - 1]`, but
    // the server returns staff sorted by NAME. Adding Mabel to a branch that
    // already had Adjei and Zainab selected Zainab, so the credentials panel
    // named one cashier while the detail pane showed another — an admin
    // reading a CounterID off that pane hands out the wrong one.
    const adjei = staffPayload("adjei", "Adjei Mensah");
    const zainab = staffPayload("zainab", "Zainab Osei");
    const mabel = staffPayload("mabel", "Mabel Owusu", { staffCode: "BBNEW777" });

    queue(
      { status: 200, body: { stores: [storePayload({ staff: [adjei, zainab] })] } },
      {
        status: 201,
        body: {
          store: storePayload({ staff: [adjei, mabel, zainab] }),
          credentials: {
            staffCode: "BBNEW777",
            email: "bbnew777@counter.baebe-boo.jtechinnovations.tech",
            password: "PASSWORD12345",
          },
        },
      },
    );
    await renderWorkspace();

    await userEvent.click(screen.getAllByRole("button", { name: "Add staff to Baebe Boo Sakumono" })[0]);
    const dialog = screen.getByRole("dialog");
    await userEvent.type(within(dialog).getByRole("textbox", { name: /Staff name/ }), "Mabel Owusu");
    await userEvent.click(within(dialog).getByRole("button", { name: "Add staff member" }));

    // The staff detail pane names whoever is selected.
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Mabel Owusu" })).toBeInTheDocument(),
    );
    expect(screen.queryByRole("heading", { name: "Zainab Osei" })).not.toBeInTheDocument();
  });
});

describe("StoreManagement — a failed action does not take the workspace away", () => {
  it("reports a failed password reset without unmounting the store list", async () => {
    // These four actions have no modal to report into, so their failures were
    // routed to the workspace-level error — which replaces the entire list and
    // detail pane with "This workspace could not load". A password reset that
    // did not work is not a workspace that did not load.
    queue(
      { status: 200, body: { stores: [storePayload({ staff: [staffPayload("adjei", "Adjei Mensah")] })] } },
      { status: 502, body: { message: "The counter login could not be reset." } },
    );
    await renderWorkspace();

    await userEvent.click(screen.getByRole("button", { name: /Reset password/ }));

    await waitFor(() =>
      expect(screen.getByText("The counter login could not be reset.")).toBeInTheDocument(),
    );
    expect(screen.queryByText("This workspace could not load")).not.toBeInTheDocument();
    // Still on the same screen, with the button that failed ready to press again.
    expect(screen.getByRole("heading", { name: "Adjei Mensah" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Reset password/ })).toBeInTheDocument();
  });

  it("reports a failed revoke the same way", async () => {
    queue(
      { status: 200, body: { stores: [storePayload({ staff: [staffPayload("adjei", "Adjei Mensah")] })] } },
      { status: 409, body: { message: "Counter access could not be revoked." } },
    );
    await renderWorkspace();

    await userEvent.click(screen.getByRole("button", { name: "Revoke access" }));

    await waitFor(() =>
      expect(screen.getByText("Counter access could not be revoked.")).toBeInTheDocument(),
    );
    expect(screen.queryByText("This workspace could not load")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Adjei Mensah" })).toBeInTheDocument();
  });
});

describe("StoreManagement — the editors are real forms", () => {
  it("saves on Enter, without reaching for the mouse", async () => {
    // Save was `type="button"` outside any `<form>`, so there was nothing for
    // Enter to submit — on a form of three fields, on a tablet.
    queue(
      { status: 200, body: { stores: [] } },
      { status: 201, body: { store: storePayload({ name: "Baebe Boo Ho", location: "Ho" }) } },
    );
    await renderWorkspace();

    await userEvent.click(screen.getAllByRole("button", { name: /Add store/ })[0]);
    const dialog = screen.getByRole("dialog");
    await userEvent.type(within(dialog).getByRole("textbox", { name: /Store name/ }), "Baebe Boo Ho");
    await userEvent.type(within(dialog).getByRole("textbox", { name: /Location/ }), "Ho{enter}");

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1][0]).toBe("/api/admin/stores");
    expect(lastRequestBody()).toEqual({
      name: "Baebe Boo Ho",
      location: "Ho",
      isActive: true,
    });
  });

  it("refuses to send a store with no name, and says which field", async () => {
    // The inputs were marked `required` while Save was a plain button outside
    // any form, so the attribute validated precisely nothing: a blank name was
    // posted and came back a 400 round-trip later.
    queue({ status: 200, body: { stores: [] } });
    await renderWorkspace();

    await userEvent.click(screen.getAllByRole("button", { name: /Add store/ })[0]);
    const dialog = screen.getByRole("dialog");
    await userEvent.type(within(dialog).getByRole("textbox", { name: /Location/ }), "Ho");
    await userEvent.click(within(dialog).getByRole("button", { name: "Create store" }));

    await waitFor(() =>
      expect(screen.getByText("Give the branch a name.")).toBeInTheDocument(),
    );
    // Nothing left the browser: only the initial GET was ever made.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("refuses to send a staff member with no name", async () => {
    queue({ status: 200, body: { stores: [storePayload()] } });
    await renderWorkspace();

    await userEvent.click(screen.getAllByRole("button", { name: "Add staff to Baebe Boo Sakumono" })[0]);
    const dialog = screen.getByRole("dialog");
    await userEvent.type(within(dialog).getByRole("textbox", { name: /Contact/ }), "0240000000");
    await userEvent.click(within(dialog).getByRole("button", { name: "Add staff member" }));

    await waitFor(() =>
      expect(screen.getByText("Enter the staff member's name.")).toBeInTheDocument(),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
