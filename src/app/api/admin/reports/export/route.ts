import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeAdminApi } from "@/lib/auth";
import {
  loadProfitSummary,
  loadSalesByBranch,
  loadSalesByCashier,
  loadTopCustomers,
  loadTopBrands,
  loadInventoryHealth,
} from "@/lib/admin/reports";
import { listExpenses } from "@/lib/admin/finance";
import { listPurchaseOrders, listSuppliers, listSupplierBalances } from "@/lib/admin/procurement";
import { supabaseAdmin } from "@/lib/supabase-admin";

const querySchema = z.object({
  report: z.enum([
    "profit",
    "sales-by-branch",
    "sales-by-cashier",
    "top-customers",
    "top-brands",
    "inventory",
    "orders",
    "expenses",
    "suppliers",
    "purchase-orders",
  ]),
  period: z.enum(["today", "month", "year"]).optional().default("today"),
  limit: z.coerce.number().int().min(1).max(500).optional().default(100),
  status: z.enum(["low_stock", "dead_stock", "slow_moving", "healthy"]).optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  const escaped = text.replace(/"/g, '""');
  if (escaped.includes(",") || escaped.includes('"') || escaped.includes("\n") || escaped.includes("\r")) {
    return `"${escaped}"`;
  }
  return escaped;
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.map(csvCell).join(","),
    ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(",")),
  ];
  return lines.join("\n");
}

function filename(report: string, extension = "csv") {
  const date = new Date().toISOString().slice(0, 10);
  return `${report}-${date}.${extension}`;
}

function csvResponse(rows: Record<string, unknown>[], report: string) {
  const csv = toCsv(rows);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename(report)}"`,
    },
  });
}

const capabilityByReport: Record<
  z.infer<typeof querySchema>["report"],
  Parameters<typeof authorizeAdminApi>[0]
> = {
  profit: "orders:read",
  "sales-by-branch": "orders:read",
  "sales-by-cashier": "orders:read",
  "top-customers": "customers:read",
  "top-brands": "catalog:read",
  inventory: "inventory:read",
  orders: "orders:read",
  expenses: "orders:read",
  suppliers: "orders:read",
  "purchase-orders": "orders:read",
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parse = querySchema.safeParse({
    report: searchParams.get("report") || undefined,
    period: searchParams.get("period") || undefined,
    limit: searchParams.get("limit") || undefined,
    status: searchParams.get("status") || undefined,
    year: searchParams.get("year") || undefined,
    month: searchParams.get("month") || undefined,
    start: searchParams.get("start") || undefined,
    end: searchParams.get("end") || undefined,
  });

  if (!parse.success) {
    return NextResponse.json({ message: "Invalid export request." }, { status: 400 });
  }

  const { report } = parse.data;
  const authorization = await authorizeAdminApi(capabilityByReport[report]);
  if (!authorization.authorized) return authorization.response;

  try {
    switch (report) {
      case "profit": {
        const data = await loadProfitSummary(parse.data.period);
        return csvResponse(
          [
            {
              revenue: data.revenue,
              cost_of_goods_sold: data.costOfGoodsSold,
              discounts: data.discounts,
              refunds: data.refunds,
              gross_profit: data.grossProfit,
              gross_margin_percent: data.grossMargin,
              order_count: data.orderCount,
            },
          ],
          report,
        );
      }
      case "sales-by-branch": {
        const rows = await loadSalesByBranch();
        return csvResponse(
          rows.map((row) => ({
            branch: row.shopName,
            orders: row.orderCount,
            revenue: row.revenue,
            gross_profit: row.grossProfit,
          })),
          report,
        );
      }
      case "sales-by-cashier": {
        const rows = await loadSalesByCashier();
        return csvResponse(
          rows.map((row) => ({
            cashier: row.cashierName,
            branch: row.shopName,
            orders: row.orderCount,
            total_sales: row.totalSales,
            average_order_value: row.averageOrderValue,
          })),
          report,
        );
      }
      case "top-customers": {
        const rows = await loadTopCustomers(parse.data.limit);
        return csvResponse(
          rows.map((row) => ({
            customer: row.customerName,
            email: row.email,
            phone: row.phone,
            total_orders: row.totalOrders,
            lifetime_spend: row.lifetimeSpend,
            average_order_value: row.averageOrderValue,
            loyalty_points: row.loyaltyPoints,
            last_order_at: row.lastOrderAt,
          })),
          report,
        );
      }
      case "top-brands": {
        const rows = await loadTopBrands(parse.data.limit);
        return csvResponse(
          rows.map((row) => ({
            brand: row.brandName,
            units_sold: row.unitsSold,
            revenue: row.revenue,
          })),
          report,
        );
      }
      case "inventory": {
        const rows = await loadInventoryHealth(parse.data.status);
        return csvResponse(
          rows.map((row) => ({
            product: row.productName,
            sku: row.sku,
            branch: row.shopName,
            status: row.status,
            on_hand: row.onHand,
            reserved: row.reserved,
            available: row.available,
            reorder_point: row.reorderPoint,
            units_sold_30d: row.unitsSold30d,
          })),
          report,
        );
      }
      case "expenses": {
        const rows = await listExpenses({
          year: parse.data.year,
          month: parse.data.month,
        });
        return csvResponse(
          rows.map((row) => ({
            date: row.expenseDate,
            category: row.categoryName,
            branch: row.shopName,
            amount: row.amount,
            note: row.note,
            receipt_url: row.receiptUrl,
          })),
          report,
        );
      }
      case "orders": {
        let query = supabaseAdmin
          .from("orders")
          .select(
            "id, order_number, customer_name, customer_email, customer_phone, total_amount, payment_status, order_status, order_type, created_at",
          )
          .order("created_at", { ascending: false })
          .limit(parse.data.limit);

        if (parse.data.start) query = query.gte("created_at", `${parse.data.start}T00:00:00Z`);
        if (parse.data.end) query = query.lte("created_at", `${parse.data.end}T23:59:59Z`);

        const { data, error } = await query;
        if (error) throw new Error(error.message);
        return csvResponse(
          (data || []).map((row) => ({
            order_number: row.order_number,
            customer_name: row.customer_name,
            customer_email: row.customer_email,
            customer_phone: row.customer_phone,
            total: row.total_amount,
            payment_status: row.payment_status,
            order_status: row.order_status,
            order_type: row.order_type,
            created_at: row.created_at,
          })),
          report,
        );
      }
      case "suppliers": {
        const [suppliers, balances] = await Promise.all([listSuppliers(), listSupplierBalances()]);
        const balanceById = new Map(balances.map((b) => [b.supplierId, b]));
        return csvResponse(
          suppliers.map((supplier) => {
            const balance = balanceById.get(supplier.id);
            return {
              name: supplier.name,
              contact_name: supplier.contactName,
              email: supplier.email,
              phone: supplier.phone,
              address: supplier.address,
              payment_terms: supplier.paymentTerms,
              is_active: supplier.isActive,
              outstanding_balance: balance?.outstandingBalance ?? 0,
            };
          }),
          report,
        );
      }
      case "purchase-orders": {
        const rows = await listPurchaseOrders();
        return csvResponse(
          rows.map((row) => ({
            reference: row.referenceNumber || `PO-${row.id.slice(0, 8).toUpperCase()}`,
            supplier: row.supplierName,
            branch: row.shopName,
            status: row.status,
            total: row.totalAmount,
            expected_delivery: row.expectedDeliveryDate,
            received_at: row.receivedAt,
            item_count: row.items.length,
          })),
          report,
        );
      }
      default:
        return NextResponse.json({ message: "Unsupported report." }, { status: 400 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Export could not be generated.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
