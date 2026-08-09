import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock is hoisted above the imports, so the doubles it closes over have to
// be created by vi.hoisted rather than declared as ordinary consts.
const mocks = vi.hoisted(() => ({
  upload: vi.fn(async () => ({ error: null })),
  getPublicUrl: vi.fn(() => ({ data: { publicUrl: "https://example.test/photo.jpg" } })),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    storage: {
      from: () => ({ upload: mocks.upload, getPublicUrl: mocks.getPublicUrl }),
    },
  },
}));

import type { AdminProduct, AdminProductVariant } from "@/domain/admin-products";
import ProductWizardModal from "./ProductWizardModal";

afterEach(cleanup);

const osu = "aaaaaaaa-aaaa-4aaa-8aaa-000000000001";
const spintex = "aaaaaaaa-aaaa-4aaa-8aaa-000000000002";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => {
    if (String(url).startsWith("/api/admin/stores")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          stores: [
            { id: osu, name: "Osu", isActive: true },
            { id: spintex, name: "Spintex", isActive: true },
          ],
        }),
      };
    }
    return { ok: true, status: 200, json: async () => ({ product: {} }) };
  });
  vi.stubGlobal("fetch", fetchMock);
});

const colours = ["Pink", "Blue"];
const sizes = ["3M", "6M", "9M"];

function variantFor(colour: string, size: string, index: number): AdminProductVariant {
  return {
    id: `variant-${index}`,
    sku: `CL-26123ABC-${colour.toUpperCase()}-${size}`,
    title: `${colour} / ${size}`,
    price: 40,
    compareAtPrice: null,
    active: true,
    isDefault: index === 0,
    optionValues: { colour, size },
    inventory: [
      {
        id: `level-${index}`,
        variantId: `variant-${index}`,
        shopId: osu,
        shopName: "Osu",
        shopLocation: "Osu",
        onHand: 5,
        reserved: 0,
        available: 5,
        reorderPoint: 2,
        updatedAt: "",
      },
    ],
  };
}

/** A live 2 × 3 product — the shape the whole versions editor exists for. */
function variableProduct(): AdminProduct {
  let index = 0;
  const variants = colours.flatMap((colour) =>
    sizes.map((size) => variantFor(colour, size, index++)),
  );
  return {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-000000000001",
    name: "2-Pack Cotton Sleepsuits",
    description: "Soft combed cotton.",
    category: "Baby Clothing",
    ageRange: "3–6 Months",
    gender: "Unisex",
    price: 40,
    sku: "CL-26123ABC",
    imageUrl: "https://example.test/main.jpg",
    gallery: [],
    active: true,
    featured: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    options: [
      { name: "Colour", values: colours },
      { name: "Size", values: sizes },
    ],
    variants,
  };
}

async function openVersionsEditor() {
  const view = render(
    <ProductWizardModal
      mode="versions"
      product={variableProduct()}
      onClose={vi.fn()}
      onSaved={vi.fn()}
    />,
  );
  // The shop chips only appear once /api/admin/stores has answered.
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  return view;
}

async function reachTheGrid() {
  await openVersionsEditor();
  await userEvent.click(screen.getByRole("button", { name: /^Next/ }));
  await screen.findByRole("table");
}

function priceInputs() {
  return screen
    .getAllByRole("spinbutton")
    .filter((input) => (input.getAttribute("aria-label") || "").startsWith("Price for "));
}

async function applyBulk(button: string, value: string) {
  await userEvent.click(screen.getByRole("button", { name: button }));
  const popover = screen.getByRole("dialog", { name: button });
  await userEvent.clear(within(popover).getByLabelText(/New (price|stock count)/));
  await userEvent.type(within(popover).getByLabelText(/New (price|stock count)/), value);
  await userEvent.click(within(popover).getByRole("button", { name: "Apply" }));
}

async function openCreateWizard() {
  const view = render(
    <ProductWizardModal mode="create" product={null} onClose={vi.fn()} onSaved={vi.fn()} />,
  );
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  return view;
}

async function fillBasicsAndPhoto(container: HTMLElement) {
  await userEvent.type(screen.getByRole("textbox", { name: /Product name/ }), "Sleepsuit");
  await userEvent.type(screen.getByRole("spinbutton", { name: /^Price/ }), "40");
  await userEvent.click(screen.getByRole("button", { name: /^Next/ }));

  const file = container.querySelector('input[type="file"]') as HTMLInputElement;
  await userEvent.upload(file, new File(["x"], "front.jpg", { type: "image/jpeg" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Choose a different photo" })).toBeInTheDocument(),
  );
  await userEvent.click(screen.getByRole("button", { name: /^Next/ }));
}

function postBody() {
  const call = fetchMock.mock.calls.find(
    ([url, init]) => String(url) === "/api/admin/products" && (init as { method?: string })?.method === "POST",
  );
  return JSON.parse((call?.[1] as { body: string }).body);
}

describe("creating a product", () => {
  it("asks for one stock number and sends no versions when there are no choices", async () => {
    const { container } = await openCreateWizard();
    await fillBasicsAndPhoto(container);

    // Step 3 defaults to "No", so Next lands straight on the single stock box.
    expect(screen.getByRole("radio", { name: "No, just one version" })).toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: /^Next/ }));

    const stock = screen.getByRole("spinbutton", { name: /Stock per shop/ });
    await userEvent.clear(stock);
    await userEvent.type(stock, "12");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /^Save/ }));

    await waitFor(() => expect(postBody().name).toBe("Sleepsuit"));
    const body = postBody();
    expect(body.options).toEqual([]);
    expect(body.variants).toEqual([]);
    expect(body.availability).toEqual([{ shopId: osu, onHand: 12, reorderPoint: 2 }]);
  });

  it("builds the grid from the choices and seeds every cell with the starting stock", async () => {
    const { container } = await openCreateWizard();
    await fillBasicsAndPhoto(container);

    await userEvent.click(screen.getByRole("radio", { name: "Yes, it has choices" }));
    await userEvent.type(screen.getByLabelText("Name of choice 1"), "Colour");
    const values = screen.getByLabelText(/Choices for/);
    fireEvent.change(values, { target: { value: "Pink,Blue" } });
    fireEvent.keyDown(values, { key: "Enter" });

    expect(await screen.findByText("This will create 2 versions.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /^Next/ }));

    const stock = screen.getByRole("spinbutton", { name: /Stock per shop to start with/ });
    await userEvent.clear(stock);
    await userEvent.type(stock, "7");
    expect(priceInputs()).toHaveLength(2);

    await userEvent.click(screen.getByRole("button", { name: /^Save/ }));

    await waitFor(() => expect(postBody().variants).toHaveLength(2));
    const body = postBody();
    expect(body.options).toEqual([{ name: "Colour", values: ["Pink", "Blue"] }]);
    expect(body.variants[0].optionValues).toEqual({ colour: "Pink" });
    expect(body.variants[0].stock).toEqual([{ shopId: osu, onHand: 7, reorderPoint: 2 }]);
    expect(body.variants.filter((variant: { isDefault: boolean }) => variant.isDefault)).toHaveLength(1);
  });

  it("will not move past the photos step without a main photo", async () => {
    await openCreateWizard();
    await userEvent.type(screen.getByRole("textbox", { name: /Product name/ }), "Sleepsuit");
    await userEvent.type(screen.getByRole("spinbutton", { name: /^Price/ }), "40");
    await userEvent.click(screen.getByRole("button", { name: /^Next/ }));

    await userEvent.click(screen.getByRole("button", { name: /^Next/ }));

    expect(
      screen.getByText("Choose a main photo — shoppers will not open a product without one."),
    ).toBeInTheDocument();
  });
});

describe("the options step", () => {
  it("tells the seller how many versions their choices come to", async () => {
    await openVersionsEditor();

    expect(
      screen.getByText("This will create 6 versions (2 colours × 3 sizes)."),
    ).toBeInTheDocument();
  });

  it("refuses to go on past a hundred versions, and says what to do instead", async () => {
    await openVersionsEditor();
    expect(screen.getByRole("button", { name: /^Next/ })).toBeEnabled();

    await userEvent.click(screen.getByRole("button", { name: "Add another option" }));
    await userEvent.type(screen.getByLabelText("Name of choice 3"), "Pack");
    // Set the whole list in one change rather than typing it: each comma
    // commits a chip, and eighteen separate commits would rebuild the grid
    // eighteen times on the way past the cap.
    const values = screen.getByLabelText("Choices for Pack");
    fireEvent.change(values, { target: { value: Array.from({ length: 18 }, (_, i) => `P${i}`).join(",") } });
    fireEvent.keyDown(values, { key: "Enter" });

    expect(await screen.findByText(/This will create 108 versions/)).toBeInTheDocument();
    expect(
      screen.getByText(/more versions than we can manage in one product/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Next/ })).toBeDisabled();
  });
});

describe("the bulk bar", () => {
  it("sets one price across every version when nothing is ticked", async () => {
    await reachTheGrid();
    expect(priceInputs()).toHaveLength(6);

    await applyBulk("Set price", "25");

    for (const input of priceInputs()) {
      expect(input).toHaveValue(25);
    }
  });

  it("changes only the three versions that are ticked", async () => {
    await reachTheGrid();

    for (const title of ["Pink / 3M", "Pink / 6M", "Pink / 9M"]) {
      await userEvent.click(screen.getByRole("checkbox", { name: `Select ${title}` }));
    }
    expect(screen.getByText("Change 3 versions selected")).toBeInTheDocument();

    await applyBulk("Set price", "25");

    for (const title of ["Pink / 3M", "Pink / 6M", "Pink / 9M"]) {
      expect(screen.getByLabelText(`Price for ${title}`)).toHaveValue(25);
    }
    for (const title of ["Blue / 3M", "Blue / 6M", "Blue / 9M"]) {
      expect(screen.getByLabelText(`Price for ${title}`)).toHaveValue(40);
    }
  });

  it("greys a removed version rather than deleting it, so it can be put back", async () => {
    await reachTheGrid();

    await userEvent.click(screen.getByRole("checkbox", { name: "Select Blue / 9M" }));
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    await userEvent.click(
      within(screen.getByRole("dialog", { name: "Remove" })).getByRole("button", { name: "Apply" }),
    );

    expect(screen.getByRole("button", { name: /Undo/ })).toBeInTheDocument();
    expect(screen.getByText(/Blue \/ 9M — 5 in stock\. Will be switched off/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Undo/ }));
    expect(screen.queryByText(/Will be switched off/)).not.toBeInTheDocument();
  });
});

describe("saving the versions", () => {
  it("names the offending code and highlights its row on a 409", async () => {
    // THE BUG: the server answers a duplicate code with a sentence and no field
    // map, so the grid showed "Could not save" over a hundred rows with no
    // indication of which cell was wrong.
    await reachTheGrid();
    const clashing = "CL-26123ABC-BLUE-6M";
    fetchMock.mockImplementationOnce(async () => ({
      ok: false,
      status: 409,
      json: async () => ({
        message: `The product code ${clashing} is already used elsewhere in your catalogue. Give this version a different code.`,
      }),
    }));

    await userEvent.click(screen.getByRole("button", { name: /^Save/ }));

    const field = await screen.findByLabelText("Code for Blue / 6M");
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(
      screen.getByText("This code is already used elsewhere. Give this version a different one."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Code for Pink / 3M")).not.toHaveAttribute("aria-invalid");
  });

  it("keeps everything the seller typed when the save fails", async () => {
    await reachTheGrid();
    await applyBulk("Set price", "31");
    fetchMock.mockImplementationOnce(async () => ({
      ok: false,
      status: 500,
      json: async () => ({ message: "The catalog operation could not be completed." }),
    }));

    await userEvent.click(screen.getByRole("button", { name: /^Save/ }));

    await screen.findByText("The catalog operation could not be completed.");
    for (const input of priceInputs()) {
      expect(input).toHaveValue(31);
    }
  });

  it("sends the whole grid, with stock per shop and exactly one default", async () => {
    await reachTheGrid();

    await userEvent.click(screen.getByRole("button", { name: /^Save/ }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/variants"),
        expect.objectContaining({ method: "PUT" }),
      ),
    );
    const call = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/variants"));
    const body = JSON.parse((call?.[1] as { body: string }).body);
    expect(body.variants).toHaveLength(6);
    expect(body.variants.filter((variant: { isDefault: boolean }) => variant.isDefault)).toHaveLength(1);
    expect(body.variants[0].stock).toEqual([{ shopId: osu, onHand: 5, reorderPoint: 2 }]);
    expect(body.options).toEqual([
      { name: "Colour", values: colours },
      { name: "Size", values: sizes },
    ]);
  });
});
