import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { slugify } from "@/components/storefront/catalog-data";
import { authorizeAdminApi } from "@/lib/auth";
import {
  buildNativeCalibrationJob,
  buildNativeLabelJob,
} from "@/lib/labels/native-print";
import {
  labelFilename,
  labelQrPayload,
  renderLabelCalibrationPdf,
  renderShelfLabelsPdf,
  type ShelfLabel,
} from "@/lib/labels/label-pdf";
import { supabaseAdmin } from "@/lib/supabase-admin";

const itemSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().optional(),
  /** Stickers per version. Defaults to 1. */
  copies: z.number().int().min(1).max(50).optional(),
});

const bodySchema = z.object({
  items: z.array(itemSchema).min(1).max(100).optional(),
  /** Print the calibration page instead of labels. */
  calibration: z.boolean().optional(),
  /** Request a print payload for the workstation-local connector. */
  print: z.boolean().optional(),
  transport: z.literal("local").optional(),
  /** Queue selected and verified by the printer setup flow. */
  printer: z.string().trim().min(1).max(128).optional(),
});

function siteUrl(): string {
  const raw = (process.env.NEXT_PUBLIC_SITE_URL || "").trim().replace(/\/+$/, "");
  return raw || "https://baebe-boo.jtechinnovations.tech";
}

function variantLabel(optionValues: unknown, title: string): string {
  const order = ["color", "colour", "size", "material"];
  const entries = Object.entries((optionValues || {}) as Record<string, unknown>)
    .map(([key, value]) => [key, String(value ?? "").trim()] as const)
    .filter(([, value]) => value.length > 0)
    .sort(([a], [b]) => {
      const rank = (key: string) => {
        const index = order.indexOf(key.toLowerCase());
        return index === -1 ? order.length : index;
      };
      return rank(a) - rank(b) || a.localeCompare(b);
    });
  if (entries.length > 0) return entries.map(([, value]) => value).join(" · ");
  return title && title !== "Default" ? title : "";
}

/**
 * Shelf-label PDFs for the thermal printer (XP-365B, 30×50mm).
 *
 * Read-only export gated on `catalog:read`: nothing is written, but the rows
 * carry internal SKUs. At most 200 stickers per request — a bigger catalogue
 * prints in batches so one click cannot tie up the server.
 */
export async function POST(request: Request) {
  const authorization = await authorizeAdminApi("catalog:read");
  if (!authorization.authorized) return authorization.response;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: "Invalid label request." }, { status: 400 });
  }

  try {
    if (parsed.data.calibration) {
      if (parsed.data.print) {
        if (parsed.data.transport !== "local") {
          return NextResponse.json(
            { message: "Use the local printer connector for physical calibration printing." },
            { status: 400 },
          );
        }
        return NextResponse.json({
          printed: false,
          transport: "local-bridge",
          title: "Baebe Boo label calibration",
          jobBase64: buildNativeCalibrationJob().toString("base64"),
        });
      }
      const pdf = await renderLabelCalibrationPdf();
      return new NextResponse(new Uint8Array(pdf), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": 'attachment; filename="baebe-boo-label-calibration.pdf"',
          "Cache-Control": "no-store",
        },
      });
    }

    const items = parsed.data.items || [];
    const productIds = [...new Set(items.map((item) => item.productId))];
    const [{ data: productsData }, { data: variantsData }] = await Promise.all([
      supabaseAdmin.from("products").select("id,name").in("id", productIds),
      supabaseAdmin.from("product_variants").select("id,product_id,sku,title,option_values,price").in("product_id", productIds),
    ]);
    const products = new Map(
      ((productsData || []) as Array<{ id: string; name: string }>).map((row) => [String(row.id), row]),
    );
    const variants = ((variantsData || []) as Array<{
      id: string;
      product_id: string;
      sku: string;
      title: string;
      option_values: unknown;
      price: number | string;
    }>).map((row) => ({ ...row, id: String(row.id), product_id: String(row.product_id) }));

    const labels: ShelfLabel[] = [];
    for (const item of items) {
      const product = products.get(item.productId);
      if (!product) continue;
      const candidates = variants.filter((variant) => variant.product_id === item.productId);
      const selected = item.variantId
        ? candidates.filter((variant) => variant.id === item.variantId)
        : candidates;
      for (const variant of selected) {
        const slug = `${slugify(product.name)}-${product.id}`;
        const copies = item.copies ?? 1;
        for (let copy = 0; copy < copies; copy++) {
          labels.push({
            shopName: "Baebe Boo",
            productName: product.name,
            variantLabel: variantLabel(variant.option_values, variant.title),
            price: Number(variant.price),
            sku: variant.sku,
            url: labelQrPayload(siteUrl(), slug, variant.sku),
          });
        }
      }
      if (labels.length > 200) break;
    }

    if (labels.length === 0) {
      return NextResponse.json({ message: "No printable versions found for that selection." }, { status: 400 });
    }

    if (parsed.data.print) {
      if (parsed.data.transport !== "local") {
        return NextResponse.json(
          { message: "Use the local printer connector for physical label printing." },
          { status: 400 },
        );
      }
      const printer = parsed.data.printer?.trim();
      const verifiedPrinter = (await cookies()).get("baebe_printer_verified")?.value;
      if (!printer || verifiedPrinter !== printer) {
        return NextResponse.json(
          { message: "Connect the printer and complete its test page before printing labels." },
          { status: 428 },
        );
      }
      return NextResponse.json({
        printed: false,
        transport: "local-bridge",
        printer,
        title: "Baebe Boo shelf labels",
        jobBase64: buildNativeLabelJob(labels.slice(0, 200)).toString("base64"),
        count: Math.min(labels.length, 200),
      });
    }
    const pdf = await renderShelfLabelsPdf(labels.slice(0, 200));
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${labelFilename(labels.length)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Labels could not be generated.";
    const status = /missing|fonts|printer|cups|exited|configured/i.test(message) ? 503 : 500;
    return NextResponse.json({ message }, { status });
  }
}
