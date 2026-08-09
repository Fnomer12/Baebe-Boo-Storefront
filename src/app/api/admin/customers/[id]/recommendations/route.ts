import { NextResponse } from "next/server";
import { authorizeAdminApi } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { ageRangeLabelsForChild, nextBirthdayChild } from "@/domain/admin-customers";
import { collectChildren } from "@/domain/crm/customer-identity";
import { resolveCustomer } from "../../_customer-record";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authorization = await authorizeAdminApi("customers:read");
  if (!authorization.authorized) return authorization.response;

  const { id } = await params;

  let customer;
  try {
    customer = await resolveCustomer(id);
  } catch {
    return NextResponse.json({ message: "Customer could not be loaded." }, { status: 500 });
  }
  if (!customer) {
    return NextResponse.json({ message: "Customer not found." }, { status: 404 });
  }

  const { data: childRows } = customer.userId
    ? await supabaseAdmin
        .from("customer_children")
        .select("first_name, date_of_birth")
        .eq("user_id", customer.userId)
    : { data: [] };

  const children = collectChildren(
    (childRows || []).map((child) => ({
      first_name: child.first_name,
      date_of_birth: child.date_of_birth ? String(child.date_of_birth) : null,
    })),
    customer.members,
  );

  // Recommend for whoever's birthday is next: that is the child the admin is
  // most likely looking at this panel about.
  const leading = nextBirthdayChild(
    children.map((child) => ({ firstName: child.first_name || "", dateOfBirth: child.date_of_birth })),
  );
  const labels = leading?.dateOfBirth ? ageRangeLabelsForChild(leading.dateOfBirth) : ["all ages"];

  const { data: ageProducts, error: productsError } = await supabaseAdmin
    .from("products")
    .select("id, name, category, age_range, gender, price, image_url, is_active")
    .eq("is_active", true)
    .in("age_range", labels)
    .limit(8);
  if (productsError) {
    return NextResponse.json({ message: "Recommendations could not be loaded." }, { status: 500 });
  }

  const products = (ageProducts || []).map((product) => ({
    id: product.id,
    name: product.name || "",
    category: product.category || "",
    ageRange: product.age_range || "",
    gender: product.gender || "",
    price: Number(product.price || 0),
    imageUrl: product.image_url || "",
  }));

  if (products.length < 4) {
    const existingIds = new Set(products.map((product) => product.id));
    const { data: bestSellers } = await supabaseAdmin.rpc("get_best_selling_products", {
      p_limit: 12,
    });

    const fallbackIds = (bestSellers || [])
      .map((row: { product_id: string }) => row.product_id)
      .filter((productId: string) => !existingIds.has(productId))
      .slice(0, 8 - products.length);

    if (fallbackIds.length) {
      const { data: fallbackProducts } = await supabaseAdmin
        .from("products")
        .select("id, name, category, age_range, gender, price, image_url")
        .in("id", fallbackIds)
        .eq("is_active", true);

      const fallbackById = new Map(
        (fallbackProducts || []).map((product) => [
          product.id,
          {
            id: product.id,
            name: product.name || "",
            category: product.category || "",
            ageRange: product.age_range || "",
            gender: product.gender || "",
            price: Number(product.price || 0),
            imageUrl: product.image_url || "",
          },
        ]),
      );

      for (const row of bestSellers || []) {
        const product = fallbackById.get(row.product_id);
        if (product && products.length < 8) {
          products.push(product);
        }
      }
    }
  }

  return NextResponse.json({
    childName: leading?.firstName || "Child",
    ageRangeLabels: labels,
    products,
  });
}
