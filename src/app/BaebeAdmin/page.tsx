"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Cropper from "react-easy-crop";
import { supabase } from "@/lib/supabase";
import AdminPanel, { AdminTab } from "@/components/AdminPanel";
import {
  ShieldCheck,
  UploadCloud,
  Trash2,
  Pencil,
  X,
  Plus,
  ShoppingBag,
  ShoppingCart,
  Package,
  Users,
  Calendar,
  Download,
  TrendingUp,
  Box,
  BarChart3,
 ChevronDown,
Cake,
UserRound,
SlidersHorizontal,
ClipboardList,
Truck,
CircleCheck,
Bell,
Search,
Database,
} from "lucide-react";

type Shop = {
  id: string;
  name: string;
  location: string;
  databaseName: string;
};

type Product = {
  id: string;
  name: string;
  description: string;
  category: string;
  ageRange: string;
  gender: string;
  price: string;
  stock: string;
  sku: string;
  imageUrl: string;
  shops: string[];
  status: "Active" | "Draft" | "Out of Stock";
};

type StaffMember = {
  id: string;
  shopId: string;
  shopName: string;
  location: string;
  databaseName: string;
  staffName: string;
  staffContact: string;
  profileImageUrl: string;
};

type Order = {
  id: string;
  orderNumber: string;
  customerName: string;
  totalAmount: number;
  status: string;
  createdAt: string;
};

type OrderItem = {
  id: string;
  orderId: string;
  productId: string;
  productName: string;
  productImageUrl: string;
  category: string;
  quantity: number;
  price: number;
  createdAt: string;
};

type CompletedOrder = {
  id: string;
  originalOrderId: string;
  orderNumber: string;
  customerName: string;
  customerCode: string;
  orderType: "online" | "instore";
  totalAmount: number;
  completedAt: string;
  createdAt: string;
};

type CompletedOrderItem = {
  id: string;
  completedOrderId: string;
  productName: string;
  productImageUrl: string;
  category: string;
  quantity: number;
  price: number;
};

type Member = {
  id: string;
  memberCode: string;
  parentName: string;
  phone: string;
  email: string;
  childFirstName: string;
  childLastName: string;
  childDob: string;
  createdAt: string;
};

const categories = [
  "Baby Clothing",
  "Baby Shoes",
  "Feeding",
  "Toys",
  "School Essentials",
  "Nursery",
  "Gift Sets",
  "Maternity",
  "Accessories",
];

const ages = [
  "0–3 Months",
  "3–6 Months",
  "6–12 Months",
  "1–2 Years",
  "2–4 Years",
  "4–6 Years",
  "6+ Years",
];

const genders = ["Boys", "Girls", "Unisex"];


const categorySkuPrefix: Record<string, string> = {
  "Baby Clothing": "CL",
  "Baby Shoes": "SH",
  Feeding: "FD",
  Toys: "TY",
  "School Essentials": "SE",
  Nursery: "NS",
  "Gift Sets": "GS",
  Maternity: "MT",
  Accessories: "AC",
};

const generateSku = (category: string) => {
  const prefix = categorySkuPrefix[category] || "BB";
  const year = new Date().getFullYear().toString().slice(-2);
  const number = Math.floor(10000 + Math.random() * 90000);
  const random = Math.random().toString(36).substring(2, 5).toUpperCase();

  return `${prefix}-${year}${number}${random}`;
};

const generateUniqueSku = async (category: string) => {
  let sku = generateSku(category);

  for (let i = 0; i < 10; i++) {
    const { data } = await supabase
      .from("products")
      .select("id")
      .eq("sku", sku)
      .maybeSingle();

    if (!data) return sku;

    sku = generateSku(category);
  }

  return `${generateSku(category)}${Date.now().toString().slice(-2)}`;
};

export default function BaebeAdminPage() {
  const router = useRouter();

  const [checking, setChecking] = useState(true);
 const [activeTab, setActiveTab] = useState<AdminTab>("dashboard");
  const [products, setProducts] = useState<Product[]>([]);
 const [shops, setShops] = useState<Shop[]>([]);
 const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
 const [orders, setOrders] = useState<Order[]>([]);

 const [orderItems, setOrderItems] = useState<OrderItem[]>([]);

 const [completedOrders, setCompletedOrders] = useState<CompletedOrder[]>([]);
const [completedOrderItems, setCompletedOrderItems] = useState<CompletedOrderItem[]>([]);

 const [members, setMembers] = useState<Member[]>([]);




  useEffect(() => {
    const verifyAccess = async () => {
      try {
        const isAuthed = sessionStorage.getItem("baebe_admin_auth");
        const role = sessionStorage.getItem("baebe_admin_role");

        if (isAuthed !== "true") {
          router.replace("/BaebeAdmin/login");
          return;
        }

        if (role !== "boss") {
          router.replace("/BaebeCounter");
          return;
        }

        setChecking(false);
      } catch {
        router.replace("/BaebeAdmin/login");
      }
    };

    verifyAccess();
  }, [router]);

  useEffect(() => {
    const fetchShops = async () => {
      const { data, error } = await supabase
        .from("shops")
        .select("id, name, location, database_name")
        .eq("is_active", true)
        .order("created_at", { ascending: true });

      if (error) {
        console.error(error.message);
        return;
      }

      setShops(
        (data || []).map((shop) => ({
          id: shop.id,
          name: shop.name,
          location: shop.location,
          databaseName: shop.database_name,
        }))
      );
    };

    fetchShops();
  }, []);

  useEffect(() => {
    const fetchProducts = async () => {
      const { data, error } = await supabase
        .from("products")
        .select(
          `
          id,
          name,
          description,
          category,
          age_range,
          gender,
          sku,
          price,
          image_url,
          is_active,
          product_shop_availability (
            shop_id,
            stock_quantity
          )
        `
        )
        .order("created_at", { ascending: false });

      if (error) {
        console.error(error.message);
        return;
      }

      const mappedProducts: Product[] = (data || []).map((product: any) => {
        const availability = product.product_shop_availability || [];
        const totalStock = availability.reduce(
          (sum: number, item: any) => sum + Number(item.stock_quantity || 0),
          0
        );

        return {
          id: product.id,
          name: product.name,
          description: product.description || "",
          category: product.category,
          ageRange: product.age_range || "",
          gender: product.gender || "",
          price: String(product.price),
          stock: String(totalStock),
          sku: product.sku || "",
          imageUrl: product.image_url || "",
          shops: availability.map((item: any) => item.shop_id),
          status: product.is_active ? "Active" : "Draft",
        };
      });

      setProducts(mappedProducts);
    };

    fetchProducts();
  }, []);

  useEffect(() => {
  const fetchStaff = async () => {
    const { data, error } = await supabase
      .from("shop_staff")
      .select(`
        id,
        staff_name,
        staff_contact,
        profile_image_url,
        shops (
          id,
          name,
          location,
          database_name
        )
      `)
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error.message);
      return;
    }

    setStaffMembers(
      (data || []).map((item: any) => ({
        id: item.id,
        shopId: item.shops.id,
        shopName: item.shops.name,
        location: item.shops.location,
        databaseName: item.shops.database_name,
        staffName: item.staff_name,
        staffContact: item.staff_contact,
        profileImageUrl: item.profile_image_url || "",
      }))
    );
  };

  fetchStaff();
}, []);

useEffect(() => {
  const mapOrder = (order: any): Order => ({
    id: order.id,
    orderNumber: order.order_number || "",
    customerName: order.customer_name || "Customer",
    totalAmount: Number(order.total_amount || 0),
    status: order.order_status || "received",
    createdAt: order.created_at,
  });

  const fetchOrders = async () => {
    const { data, error } = await supabase
      .from("orders")
      .select("id, order_number, customer_name, total_amount, order_status, created_at")
      .order("created_at", { ascending: true });

    if (error) {
      console.error(error.message);
      return;
    }

    setOrders((data || []).map(mapOrder));
  };

  fetchOrders();

  const channel = supabase
    .channel("orders-realtime")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "orders" },
      (payload) => {
        if (payload.eventType === "INSERT") {
          const newOrder = mapOrder(payload.new);
          setOrders((prev) => [...prev, newOrder]);
        }

        if (payload.eventType === "UPDATE") {
          const updatedOrder = mapOrder(payload.new);
          setOrders((prev) =>
            prev.map((order) =>
              order.id === updatedOrder.id ? updatedOrder : order
            )
          );
        }

        if (payload.eventType === "DELETE") {
          setOrders((prev) =>
            prev.filter((order) => order.id !== payload.old.id)
          );
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}, []);

useEffect(() => {
  const fetchOrderItems = async () => {
    const { data, error } = await supabase
      .from("order_items")
      .select(`
        id,
        order_id,
        product_id,
        quantity,
        created_at,
        products (
          name,
          image_url,
          category,
          price
        )
      `)
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error.message);
      return;
    }

    setOrderItems(
      (data || []).map((item: any) => ({
        id: item.id,
        orderId: item.order_id,
        productId: item.product_id,
        productName: item.products?.name || "Product",
        productImageUrl: item.products?.image_url || "",
        category: item.products?.category || "Others",
        quantity: Number(item.quantity || 0),
        price: Number(item.products?.price || 0),
        createdAt: item.created_at,
      }))
    );
  };

  fetchOrderItems();
}, []);

useEffect(() => {
  const mapCompletedOrder = (order: any): CompletedOrder => ({
    id: order.id,
    originalOrderId: order.original_order_id || "",
    orderNumber: order.order_number || "",
    customerName: order.customer_name || "Customer",
    customerCode: order.customer_code || "",
    orderType: order.order_type || "online",
    totalAmount: Number(order.total_amount || 0),
    completedAt: order.completed_at,
    createdAt: order.created_at,
  });

  const fetchCompletedOrders = async () => {
    const { data, error } = await supabase
      .from("completed_orders")
      .select("*")
      .order("completed_at", { ascending: true });

    if (error) {
      console.error(error.message);
      return;
    }

    setCompletedOrders((data || []).map(mapCompletedOrder));
  };

  fetchCompletedOrders();

  const channel = supabase
    .channel("completed-orders-realtime")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "completed_orders" },
      (payload) => {
        if (payload.eventType === "INSERT") {
          setCompletedOrders((prev) => [...prev, mapCompletedOrder(payload.new)]);
        }

        if (payload.eventType === "UPDATE") {
          const updated = mapCompletedOrder(payload.new);
          setCompletedOrders((prev) =>
            prev.map((order) => (order.id === updated.id ? updated : order))
          );
        }

        if (payload.eventType === "DELETE") {
          setCompletedOrders((prev) =>
            prev.filter((order) => order.id !== payload.old.id)
          );
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}, []);

useEffect(() => {
  const mapCompletedItem = (item: any): CompletedOrderItem => ({
    id: item.id,
    completedOrderId: item.completed_order_id,
    productName: item.product_name || "Product",
    productImageUrl: item.product_image_url || "",
    category: item.category || "Others",
    quantity: Number(item.quantity || 0),
    price: Number(item.price || 0),
  });

  const fetchCompletedItems = async () => {
    const { data, error } = await supabase
      .from("completed_order_items")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) {
      console.error(error.message);
      return;
    }

    setCompletedOrderItems((data || []).map(mapCompletedItem));
  };

  fetchCompletedItems();

  const channel = supabase
    .channel("completed-items-realtime")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "completed_order_items" },
      (payload) => {
        if (payload.eventType === "INSERT") {
          setCompletedOrderItems((prev) => [...prev, mapCompletedItem(payload.new)]);
        }

        if (payload.eventType === "DELETE") {
          setCompletedOrderItems((prev) =>
            prev.filter((item) => item.id !== payload.old.id)
          );
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}, []);

useEffect(() => {
  const mapMember = (member: any): Member => ({
    id: member.id,
    memberCode: member.member_code || "",
    parentName: member.parent_name || "",
    phone: member.phone || "",
    email: member.email || "",
    childFirstName: member.child_first_name || "",
    childLastName: member.child_last_name || "",
    childDob: member.child_date_of_birth,
    createdAt: member.created_at,
  });

  const fetchMembers = async () => {
    const { data, error } = await supabase
      .from("members")
      .select(`
        id,
        member_code,
        parent_name,
        phone,
        email,
        child_first_name,
        child_last_name,
        child_date_of_birth,
        created_at
      `)
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error.message);
      return;
    }

    setMembers((data || []).map(mapMember));
  };

  fetchMembers();

  const channel = supabase
    .channel("members-realtime")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "members",
      },
      (payload) => {
        if (payload.eventType === "INSERT") {
          const newMember = mapMember(payload.new);
          setMembers((prev) => [newMember, ...prev]);
        }

        if (payload.eventType === "UPDATE") {
          const updatedMember = mapMember(payload.new);
          setMembers((prev) =>
            prev.map((member) =>
              member.id === updatedMember.id ? updatedMember : member
            )
          );
        }

        if (payload.eventType === "DELETE") {
          setMembers((prev) =>
            prev.filter((member) => member.id !== payload.old.id)
          );
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}, []);

const birthdayCount = members.filter((member) => {
  const today = new Date();
  const dob = new Date(member.childDob);

  return (
    dob.getMonth() === today.getMonth() &&
    dob.getDate() === today.getDate()
  );
}).length;

const notificationCount = orders.filter(
  (order) => order.status === "paid" || order.status === "pending_approval"
).length;

  if (checking) {
    return (
      <main className="h-screen overflow-hidden bg-white text-black">
        <section className="flex h-full">
          <aside className="flex w-[300px] shrink-0 flex-col bg-black px-5 py-6 text-white">
            <h1 className="text-2xl font-semibold">Baebe Boo Admin</h1>
            <p className="mt-1 text-sm text-white/45">Boss management panel</p>

            <div className="mt-auto rounded-3xl bg-white/10 p-4">
              <div className="flex items-center gap-2">
                <ShieldCheck size={18} />
                <p className="text-sm font-semibold">Secure Access</p>
              </div>
              <p className="mt-2 text-xs leading-5 text-white/45">
                Google OAuth, role checks and protected admin actions.
              </p>
            </div>
          </aside>

          <section className="flex flex-1 items-center justify-center bg-white">
            <div className="text-center">
              <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-black/10 border-t-black" />
              <p className="mt-4 text-sm text-black/50">
                Verifying administrator access...
              </p>
            </div>
          </section>
        </section>
      </main>
    );
  }

  return (
    <main className="h-screen overflow-hidden bg-white text-black">
      <section className="flex h-full">
        <AdminPanel
  activeTab={activeTab}
  setActiveTab={setActiveTab}
  notificationCount={notificationCount}
  birthdayCount={birthdayCount}
/>

        <section className="flex-1 overflow-y-auto bg-white">
          <div className="mx-auto max-w-7xl px-8 py-10">

           {activeTab === "dashboard" && (
<DashboardSection
  products={products}
  shops={shops}
  staffMembers={staffMembers}
  orders={orders}
  orderItems={orderItems}
/>
)}

            {activeTab === "upload" && (
              <UploadSection
                shops={shops}
                setProducts={setProducts}
                setActiveTab={setActiveTab}
              />
            )}

            {activeTab === "store" && (
              <StoreSection
                shops={shops}
                products={products}
                setProducts={setProducts}
              />
            )}

  {activeTab === "orders" && (
  <OrdersSection orders={orders} orderItems={orderItems} setOrders={setOrders} />
)}

{activeTab === "database" && (
  <DatabaseSection
    completedOrders={completedOrders}
    completedOrderItems={completedOrderItems}
  />
)}

{activeTab === "notifications" && (
  <NotificationsSection orders={orders} orderItems={orderItems} setOrders={setOrders} />
)}

  {activeTab === "members" && (
  <MembersSection members={members} setMembers={setMembers} />
)}

            {activeTab === "settings" && (
  <SettingsSection
    shops={shops}
    setShops={setShops}
    staffMembers={staffMembers}
    setStaffMembers={setStaffMembers}
  />
)}
          </div>
        </section>
      </section>
    </main>
  );
}

function UploadSection({
  shops,
  setProducts,
  setActiveTab,
}: {
  shops: Shop[];
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>;
  setActiveTab: (tab: AdminTab) => void;
}) {
  const [selectedShops, setSelectedShops] = useState<string[]>([]);
  const [allShops, setAllShops] = useState(false);
  const [imagePreview, setImagePreview] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [productName, setProductName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [ageRange, setAgeRange] = useState("");
  const [gender, setGender] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");
  const [sku, setSku] = useState("");
  const [status, setStatus] = useState<Product["status"]>("Active");

  const toggleAllShops = () => {
    const next = !allShops;
    setAllShops(next);
    setSelectedShops(next ? shops.map((shop) => shop.id) : []);
  };

  const toggleShop = (shopId: string) => {
    setSelectedShops((prev) => {
      const next = prev.includes(shopId)
        ? prev.filter((id) => id !== shopId)
        : [...prev, shopId];

      setAllShops(next.length === shops.length);
      return next;
    });
  };

  const handleImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError("");

    const file = e.target.files?.[0];

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Please upload a valid product image.");
      return;
    }

    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const resetForm = () => {
    setSelectedShops([]);
    setAllShops(false);
    setImagePreview("");
    setImageFile(null);
    setProductName("");
    setDescription("");
    setCategory("");
    setAgeRange("");
    setGender("");
    setPrice("");
    setStock("");
    setSku("");
    setStatus("Active");
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!productName.trim()) return setError("Product name is required.");
    if (!price || Number(price) < 0) return setError("Enter a valid product price.");
    if (!stock || Number(stock) < 0) return setError("Enter a valid stock quantity.");
    if (!category || !ageRange || !gender) return setError("Select category, age range and gender.");
    if (selectedShops.length === 0) return setError("Select All Shops or at least one shop location.");
    if (!imageFile) return setError("Product image is required.");

    try {
      setSaving(true);

      const fileExt = imageFile.name.split(".").pop();
      const fileName = `${Date.now()}-${crypto.randomUUID()}.${fileExt}`;
      const filePath = `products/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("product-images")
        .upload(filePath, imageFile);

      if (uploadError) {
        setError(uploadError.message);
        return;
      }

      const { data: publicUrlData } = supabase.storage
        .from("product-images")
        .getPublicUrl(filePath);

      const imageUrl = publicUrlData.publicUrl;

      const { data: productData, error: productError } = await supabase
        .from("products")
        .insert({
          name: productName.trim(),
          description: description.trim(),
          category,
          age_range: ageRange,
          gender,
          sku: sku.trim() || null,
          price: Number(price),
          image_url: imageUrl,
          is_active: status === "Active",
        })
        .select()
        .single();

      if (productError) {
        setError(productError.message);
        return;
      }

      const availabilityRows = selectedShops.map((shopId) => ({
        product_id: productData.id,
        shop_id: shopId,
        stock_quantity: Number(stock),
        is_available: status === "Active",
      }));

      const { error: availabilityError } = await supabase
        .from("product_shop_availability")
        .insert(availabilityRows);

      if (availabilityError) {
        setError(availabilityError.message);
        return;
      }

      const newProduct: Product = {
        id: productData.id,
        name: productName.trim(),
        description: description.trim(),
        category,
        ageRange,
        gender,
        price,
        stock,
        sku: sku.trim(),
        imageUrl,
        shops: selectedShops,
        status,
      };

      setProducts((prev) => [newProduct, ...prev]);
      resetForm();
      setActiveTab("store");
    } catch {
      setError("Something went wrong while uploading product.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleUpload}>
      <PageHeader
        title="Upload Product"
        subtitle="Add product image, price, stock, category, age, gender and shop availability."
      />

      {error && (
        <div className="mb-6 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
          <h3 className="text-xl font-semibold">Product Image</h3>

          <label className="mt-5 flex aspect-square cursor-pointer items-center justify-center overflow-hidden rounded-3xl border border-dashed border-black/20 bg-[#FAFAFA] text-center">
            {imagePreview ? (
              <img
                src={imagePreview}
                alt="Product preview"
                className="h-full w-full object-cover"
              />
            ) : (
              <div>
                <UploadCloud className="mx-auto mb-3" size={34} />
                <p className="font-semibold">Upload Image</p>
                <p className="mt-1 text-sm text-black/40">JPG, PNG or WEBP</p>
              </div>
            )}

            <input
              type="file"
              accept="image/*"
              onChange={handleImage}
              className="hidden"
            />
          </label>
        </div>

        <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
          <h3 className="text-xl font-semibold">Product Details</h3>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <Input value={productName} onChange={setProductName} placeholder="Product name" />
            <Input value={price} onChange={setPrice} placeholder="Price e.g. 240" type="number" />
            <Input value={stock} onChange={setStock} placeholder="Stock quantity" type="number" />
            <Input
                  value={sku}
                  onChange={setSku}
                  placeholder="SKU auto-generated"
                  readOnly
                />

                <Select
                  value={category}
                  onChange={async (value) => {
                    setCategory(value);

                    if (value) {
                      const newSku = await generateUniqueSku(value);
                      setSku(newSku);
                    } else {
                      setSku("");
                    }
                  }}
                  placeholder="Select category"
                  options={categories}
                />
            <Select value={ageRange} onChange={setAgeRange} placeholder="Select age range" options={ages} />
            <Select value={gender} onChange={setGender} placeholder="Select gender" options={genders} />
            <Select value={status} onChange={(v) => setStatus(v as Product["status"])} placeholder="Select status" options={["Active", "Draft", "Out of Stock"]} />
          </div>

          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={500}
            placeholder="Product description"
            className="mt-4 min-h-32 w-full rounded-3xl border border-black/10 px-5 py-4 outline-none"
          />

          <div className="mt-6">
            <h3 className="text-sm font-semibold">Shop Availability</h3>

            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <label className="flex items-center gap-3 rounded-2xl border border-black/10 bg-[#FAFAFA] px-4 py-4">
                <input type="checkbox" checked={allShops} onChange={toggleAllShops} />
                <span className="font-semibold">All Shops</span>
              </label>

              {shops.map((shop) => (
                <label key={shop.id} className="flex items-center gap-3 rounded-2xl border border-black/10 bg-[#FAFAFA] px-4 py-4">
                  <input
                    type="checkbox"
                    checked={selectedShops.includes(shop.id)}
                    onChange={() => toggleShop(shop.id)}
                  />
                  <span>{shop.location}</span>
                </label>
              ))}
            </div>
          </div>

          <button
            disabled={saving}
            className="mt-8 h-14 rounded-full bg-black px-10 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Product"}
          </button>
        </div>
      </div>
    </form>
  );
}





function StoreSection({
  shops,
  products,
  setProducts,
}: {
  shops: Shop[];
  products: Product[];
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>;
}) {
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [selectedGender, setSelectedGender] = useState("All");
  const [selectedCategory, setSelectedCategory] = useState("All Categories");
  const [selectedAge, setSelectedAge] = useState("All Ages");
  const [selectedStatus, setSelectedStatus] = useState("All Status");

  const filteredProducts = products.filter((product) => {
    const genderMatch =
      selectedGender === "All" || product.gender === selectedGender;

    const categoryMatch =
      selectedCategory === "All Categories" ||
      product.category === selectedCategory;

    const ageMatch =
      selectedAge === "All Ages" || product.ageRange === selectedAge;

    const statusMatch =
      selectedStatus === "All Status" || product.status === selectedStatus;

    return genderMatch && categoryMatch && ageMatch && statusMatch;
  });

  const clearFilters = () => {
    setSelectedGender("All");
    setSelectedCategory("All Categories");
    setSelectedAge("All Ages");
    setSelectedStatus("All Status");
    setFiltersOpen(false);
  };

  const deleteProduct = async (id: string) => {
    if (!confirm("Delete this product permanently?")) return;

    const { error } = await supabase.from("products").delete().eq("id", id);

    if (error) {
      alert(error.message);
      return;
    }

    setProducts((prev) => prev.filter((product) => product.id !== id));
  };

  return (
    <div>
      <div className="mb-8 flex items-start justify-between gap-4 border-b border-black/10 pb-6">
        <div>
          <h2 className="text-4xl font-semibold">Store</h2>
          <p className="mt-2 text-sm text-black/50">
            Manage uploaded products. Update, delete and filter products.
          </p>
        </div>

        <button
          onClick={() => setFiltersOpen(true)}
          className="flex h-12 items-center gap-2 rounded-full bg-black px-6 text-sm font-semibold text-white"
        >
          <SlidersHorizontal size={18} />
          Filter
        </button>
      </div>

      <p className="mb-5 text-sm font-semibold text-black/50">
        Showing {filteredProducts.length} of {products.length} products
      </p>

      {filteredProducts.length === 0 ? (
        <div className="rounded-3xl border border-black/10 bg-white p-8 text-sm text-black/50">
          No products match this filter.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {filteredProducts.map((product) => (
            <div
              key={product.id}
              className="overflow-hidden rounded-[1.5rem] border border-black/10 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-md"
            >
              <div className="h-44 bg-[#FAFAFA]">
                {product.imageUrl && (
                  <img
                    src={product.imageUrl}
                    alt={product.name}
                    className="h-full w-full object-cover"
                  />
                )}
              </div>

              <div className="p-4">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-black/40">
                      {product.category}
                    </p>
                    <h3 className="mt-1 line-clamp-1 text-base font-semibold">
                      {product.name}
                    </h3>
                    <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-black/35">
                    SKU: {product.sku || "No SKU"}
                  </p>
                  </div>

                  <span className="shrink-0 rounded-full bg-black px-3 py-1 text-[10px] font-semibold text-white">
                    {product.status}
                  </span>
                </div>

                <p className="text-xs text-black/50">
                  {product.ageRange} · {product.gender}
                </p>

                <div className="mt-3 flex items-center justify-between">
                  <p className="text-lg font-semibold">GH₵{product.price}</p>
                  <p className="text-xs text-black/50">Stock: {product.stock}</p>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {product.shops.map((shopId) => {
                    const shop = shops.find((item) => item.id === shopId);

                    return (
                      <span
                        key={shopId}
                        className="rounded-full bg-[#FAFAFA] px-3 py-1 text-[11px] text-black/60"
                      >
                        {shop?.location || shopId}
                      </span>
                    );
                  })}
                </div>

                <div className="mt-4 flex items-center gap-4">
                  <button
                    onClick={() => setEditingProduct(product)}
                    className="flex items-center gap-2 text-xs font-semibold text-black"
                  >
                    <Pencil size={14} />
                    Update
                  </button>

                  <button
                    onClick={() => deleteProduct(product.id)}
                    className="flex items-center gap-2 text-xs font-semibold text-red-500"
                  >
                    <Trash2 size={14} />
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {filtersOpen && (
        <>
          <div
            onClick={() => setFiltersOpen(false)}
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
          />

          <aside className="fixed right-0 top-0 z-50 h-screen w-full max-w-[430px] overflow-y-auto bg-white p-6 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-semibold">Filters</h2>
                <p className="text-sm text-black/50">Filter admin products</p>
              </div>

              <button
                onClick={() => setFiltersOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-black text-white"
              >
                <X size={18} />
              </button>
            </div>

            <FilterGroup title="Gender">
              {["All", ...genders].map((item) => (
                <FilterButton
                  key={item}
                  label={item}
                  active={selectedGender === item}
                  onClick={() => setSelectedGender(item)}
                />
              ))}
            </FilterGroup>

            <FilterGroup title="Category">
              {["All Categories", ...categories].map((item) => (
                <FilterButton
                  key={item}
                  label={item}
                  active={selectedCategory === item}
                  onClick={() => setSelectedCategory(item)}
                />
              ))}
            </FilterGroup>

            <FilterGroup title="Age Range">
              {["All Ages", ...ages].map((item) => (
                <FilterButton
                  key={item}
                  label={item}
                  active={selectedAge === item}
                  onClick={() => setSelectedAge(item)}
                />
              ))}
            </FilterGroup>

            <FilterGroup title="Status">
              {["All Status", "Active", "Draft", "Out of Stock"].map((item) => (
                <FilterButton
                  key={item}
                  label={item}
                  active={selectedStatus === item}
                  onClick={() => setSelectedStatus(item)}
                />
              ))}
            </FilterGroup>

            <div className="mt-8 grid grid-cols-2 gap-3">
              <button
                onClick={clearFilters}
                className="h-14 rounded-full border border-black/10 text-sm font-semibold"
              >
                Clear
              </button>

              <button
                onClick={() => setFiltersOpen(false)}
                className="h-14 rounded-full bg-black text-sm font-semibold text-white"
              >
                Apply
              </button>
            </div>
          </aside>
        </>
      )}

      {editingProduct && (
        <EditProductModal
          product={editingProduct}
          shops={shops}
          setProducts={setProducts}
          close={() => setEditingProduct(null)}
        />
      )}
    </div>
  );
}

function FilterGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-7">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.25em] text-black/40">
        {title}
      </h3>

      <div className="flex flex-wrap gap-3">{children}</div>
    </div>
  );
}

function FilterButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-5 py-3 text-sm font-semibold transition ${
        active
          ? "border-black bg-black text-white"
          : "border-black/10 bg-white text-black/60"
      }`}
    >
      {label}
    </button>
  );
}

function EditProductModal({
  product,
  shops,
  setProducts,
  close,
}: {
  product: Product;
  shops: Shop[];
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>;
  close: () => void;
}) {
  const [name, setName] = useState(product.name);
  const [price, setPrice] = useState(product.price);
  const [stock, setStock] = useState(product.stock);
  const [sku, setSku] = useState(product.sku);
  const [category, setCategory] = useState(product.category);
  const [ageRange, setAgeRange] = useState(product.ageRange);
  const [gender, setGender] = useState(product.gender);
  const [description, setDescription] = useState(product.description);
  const [status, setStatus] = useState<Product["status"]>(product.status);
  const [selectedShops, setSelectedShops] = useState<string[]>(product.shops);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const toggleShop = (shopId: string) => {
    setSelectedShops((prev) =>
      prev.includes(shopId)
        ? prev.filter((id) => id !== shopId)
        : [...prev, shopId]
    );
  };

  const updateProduct = async () => {
    setError("");

    if (!name.trim()) return setError("Product name is required.");
    if (!price || Number(price) < 0) return setError("Enter a valid price.");
    if (!stock || Number(stock) < 0) return setError("Enter valid stock.");
    if (selectedShops.length === 0) return setError("Select at least one shop.");

    try {
      setSaving(true);

      const { error: productError } = await supabase
        .from("products")
        .update({
          name: name.trim(),
          description: description.trim(),
          category,
          age_range: ageRange,
          gender,
          sku: sku.trim() || null,
          price: Number(price),
          is_active: status === "Active",
        })
        .eq("id", product.id);

      if (productError) {
        setError(productError.message);
        return;
      }

      const { error: deleteAvailabilityError } = await supabase
        .from("product_shop_availability")
        .delete()
        .eq("product_id", product.id);

      if (deleteAvailabilityError) {
        setError(deleteAvailabilityError.message);
        return;
      }

      const availabilityRows = selectedShops.map((shopId) => ({
        product_id: product.id,
        shop_id: shopId,
        stock_quantity: Number(stock),
        is_available: status === "Active",
      }));

      const { error: availabilityError } = await supabase
        .from("product_shop_availability")
        .insert(availabilityRows);

      if (availabilityError) {
        setError(availabilityError.message);
        return;
      }

      setProducts((prev) =>
        prev.map((item) =>
          item.id === product.id
            ? {
                ...item,
                name,
                price,
                stock,
                sku,
                category,
                ageRange,
                gender,
                description,
                status,
                shops: selectedShops,
              }
            : item
        )
      );

      close();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold">Update Product</h2>
            <p className="text-sm text-black/50">
              Changes update Supabase immediately.
            </p>
          </div>

          <button
            onClick={close}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-black text-white"
          >
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <Input value={name} onChange={setName} placeholder="Product name" />
          <Input value={price} onChange={setPrice} placeholder="Price" type="number" />
          <Input value={stock} onChange={setStock} placeholder="Stock" type="number" />
          <Input value={sku} onChange={setSku} placeholder="SKU" readOnly />
          <Select value={category} onChange={setCategory} placeholder="Category" options={categories} />
          <Select value={ageRange} onChange={setAgeRange} placeholder="Age range" options={ages} />
          <Select value={gender} onChange={setGender} placeholder="Gender" options={genders} />
          <Select value={status} onChange={(v) => setStatus(v as Product["status"])} placeholder="Status" options={["Active", "Draft", "Out of Stock"]} />
        </div>

        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Product description"
          className="mt-4 min-h-28 w-full rounded-3xl border border-black/10 px-5 py-4 outline-none"
        />

        <div className="mt-5">
          <h3 className="text-sm font-semibold">Shop Availability</h3>

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {shops.map((shop) => (
              <label
                key={shop.id}
                className="flex items-center gap-3 rounded-2xl border border-black/10 bg-[#FAFAFA] px-4 py-4"
              >
                <input
                  type="checkbox"
                  checked={selectedShops.includes(shop.id)}
                  onChange={() => toggleShop(shop.id)}
                />
                <span>{shop.location}</span>
              </label>
            ))}
          </div>
        </div>

        <button
          onClick={updateProduct}
          disabled={saving}
          className="mt-6 h-14 rounded-full bg-black px-10 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? "Updating..." : "Update Product"}
        </button>
      </div>
    </div>
  );
}

const createImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", reject);
    image.src = url;
  });

async function getCroppedImageBlob(
  imageSrc: string,
  cropPixels: any
): Promise<Blob> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  if (!ctx) throw new Error("Canvas not supported");

  canvas.width = cropPixels.width;
  canvas.height = cropPixels.height;

  ctx.drawImage(
    image,
    cropPixels.x,
    cropPixels.y,
    cropPixels.width,
    cropPixels.height,
    0,
    0,
    cropPixels.width,
    cropPixels.height
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) reject(new Error("Crop failed"));
      else resolve(blob);
    }, "image/jpeg");
  });
}


function DashboardSection({
  products,
  shops,
  staffMembers,
  orders,
  orderItems,
}: {
  products: Product[];
  shops: Shop[];
  staffMembers: StaffMember[];
  orders: Order[];
  orderItems: OrderItem[];
}) {
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());

  const filteredOrders = orders.filter((order) => {
    const date = new Date(order.createdAt);
    return (
      date.getFullYear() === selectedYear &&
      date.getMonth() === selectedMonth
    );
  });

  const monthlySales = filteredOrders.reduce(
    (sum, order) => sum + order.totalAmount,
    0
  );

  const yearlySales = orders
    .filter((order) => new Date(order.createdAt).getFullYear() === selectedYear)
    .reduce((sum, order) => sum + order.totalAmount, 0);

  const today = new Date();

  const dailySales = orders
    .filter((order) => {
      const date = new Date(order.createdAt);
      return date.toDateString() === today.toDateString();
    })
    .reduce((sum, order) => sum + order.totalAmount, 0);

  const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();

  const dailyChart = Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1;

    const sales = filteredOrders
      .filter((order) => new Date(order.createdAt).getDate() === day)
      .reduce((sum, order) => sum + order.totalAmount, 0);

    return { day, sales };
  });

  const monthlyChart = Array.from({ length: 12 }, (_, index) => {
    const sales = orders
      .filter((order) => {
        const date = new Date(order.createdAt);
        return date.getFullYear() === selectedYear && date.getMonth() === index;
      })
      .reduce((sum, order) => sum + order.totalAmount, 0);

    return {
      month: new Date(2024, index).toLocaleString("default", {
        month: "short",
      }),
      sales,
    };
  });

  const maxDaily = Math.max(...dailyChart.map((item) => item.sales), 1);
  const maxMonthly = Math.max(...monthlyChart.map((item) => item.sales), 1);

  const startYear = 2024;
const currentYear = new Date().getFullYear();

const availableYears = Array.from(
  { length: currentYear - startYear + 5 },
  (_, index) => startYear + index
);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-4xl font-semibold">Dashboard</h2>
          <p className="mt-2 text-sm text-black/50">
            Filter sales by year and month. View daily, monthly and yearly sales.
          </p>
        </div>


<div className="flex flex-wrap items-center gap-3">
  <div className="relative">
    <select
      value={selectedYear}
      onChange={(e) => setSelectedYear(Number(e.target.value))}
      className="h-11 w-28 appearance-none rounded-2xl border border-black/10 bg-white px-4 pr-10 text-base font-semibold shadow-sm outline-none focus:border-black focus:ring-2 focus:ring-black/5"
    >
      {availableYears.map((year) => (
        <option key={year} value={year}>
          {year}
        </option>
      ))}
    </select>

    <ChevronDown
      size={16}
      className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-black/60"
    />
  </div>

  <div className="relative">
    <select
      value={selectedMonth}
      onChange={(e) => setSelectedMonth(Number(e.target.value))}
      className="h-11 w-36 appearance-none rounded-2xl border border-black/10 bg-white px-4 pr-10 text-base font-semibold shadow-sm outline-none focus:border-black focus:ring-2 focus:ring-black/5"
    >
      {Array.from({ length: 12 }, (_, index) => (
        <option key={index} value={index}>
          {new Date(2024, index).toLocaleString("default", {
            month: "long",
          })}
        </option>
      ))}
    </select>

    <ChevronDown
      size={16}
      className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-black/60"
    />
  </div>

  <button className="flex h-11 items-center gap-2 rounded-2xl bg-black px-4 text-sm font-semibold text-white transition hover:bg-black/90">
    <Download size={16} />
    Export
  </button>
</div>

      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <DashboardCard
          icon={ShoppingBag}
          label="Today Sales"
          value={`GH₵${dailySales.toLocaleString()}`}
          color="bg-purple-100 text-purple-600"
        />

        <DashboardCard
          icon={ShoppingCart}
          label="Selected Month Sales"
          value={`GH₵${monthlySales.toLocaleString()}`}
          color="bg-green-100 text-green-600"
        />

        <DashboardCard
          icon={TrendingUp}
          label="Selected Year Sales"
          value={`GH₵${yearlySales.toLocaleString()}`}
          color="bg-yellow-100 text-yellow-600"
        />

        <DashboardCard
          icon={Package}
          label="All Products"
          value={products.length}
          color="bg-blue-100 text-blue-600"
        />
      </div>

   
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold">
            Daily Sales for{" "}
            {new Date(selectedYear, selectedMonth).toLocaleString("default", {
              month: "long",
            })}{" "}
            {selectedYear}
          </h3>

          <div className="mt-6 flex h-72 items-end gap-2 overflow-x-auto">
            {dailyChart.map((item) => (
              <div
                key={item.day}
                className="flex min-w-[28px] flex-col items-center gap-2"
              >
                <div
                  className="w-5 rounded-t-xl bg-purple-500"
                  style={{
                    height: `${Math.max(8, (item.sales / maxDaily) * 190)}px`,
                  }}
                />

                <span className="text-[10px] text-black/40">{item.day}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold">
            Monthly Sales for {selectedYear}
          </h3>

          <div className="mt-6 flex h-72 items-end justify-between gap-3">
            {monthlyChart.map((item) => (
              <div
                key={item.month}
                className="flex flex-1 flex-col items-center gap-2"
              >
                <div
                  className="w-full max-w-10 rounded-t-xl bg-green-500"
                  style={{
                    height: `${Math.max(8, (item.sales / maxMonthly) * 190)}px`,
                  }}
                />

                <span className="text-[10px] text-black/40">{item.month}</span>
              </div>
            ))}
          </div>
        </div>
      </div>



      <SellingProductsAndCategorySection
        orderItems={orderItems}
        selectedYear={selectedYear}
        selectedMonth={selectedMonth}
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold">Recent Orders</h3>

          <div className="mt-5 space-y-3">
            {orders.slice(0, 5).map((order) => (
              <div
                key={order.id}
                className="grid grid-cols-[1fr_100px_100px] rounded-2xl bg-[#FAFAFA] px-4 py-3 text-sm"
              >
                <span className="truncate font-medium">
                  {order.customerName}
                </span>
                <span>GH₵{order.totalAmount}</span>
                <span>{order.status}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold">Store Locations</h3>

          <div className="mt-5 space-y-3">
            {shops.map((shop) => (
              <div
                key={shop.id}
                className="grid grid-cols-[1fr_100px_70px] rounded-2xl bg-[#FAFAFA] px-4 py-3 text-sm"
              >
                <span className="truncate font-medium">{shop.name}</span>
                <span>{shop.location}</span>
                <span className="text-green-600">Active</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}


function SellingProductsAndCategorySection({
  orderItems,
  selectedYear,
  selectedMonth,
}: {
  orderItems: OrderItem[];
  selectedYear: number;
  selectedMonth: number;
}) {
  const filteredItems = orderItems.filter((item) => {
    const date = new Date(item.createdAt);
    return (
      date.getFullYear() === selectedYear &&
      date.getMonth() === selectedMonth
    );
  });

  const productMap = filteredItems.reduce<Record<string, any>>((acc, item) => {
    const key = item.productId || item.productName;

    if (!acc[key]) {
      acc[key] = {
        name: item.productName,
        imageUrl: item.productImageUrl,
        quantity: 0,
        revenue: 0,
      };
    }

    acc[key].quantity += Number(item.quantity || 0);
    acc[key].revenue += Number(item.quantity || 0) * Number(item.price || 0);

    return acc;
  }, {});

  const topSellingProducts = Object.values(productMap)
    .sort((a: any, b: any) => b.quantity - a.quantity)
    .slice(0, 5);

  const categoryMap = filteredItems.reduce<Record<string, number>>((acc, item) => {
    const category = item.category || "Others";
    acc[category] =
      (acc[category] || 0) + Number(item.quantity || 0) * Number(item.price || 0);
    return acc;
  }, {});

  const categoryList = Object.entries(categoryMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const totalRevenue = categoryList.reduce((sum, item) => sum + item[1], 0);
  const maxQuantity = Math.max(...topSellingProducts.map((p: any) => p.quantity), 1);
  const colors = ["#5B4BFF", "#38A8F5", "#48B96A", "#FFC247", "#A8ABB3"];

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-semibold">Top 5 Selling Products</h3>

        {topSellingProducts.length === 0 ? (
          <div className="flex h-80 items-center justify-center text-sm text-black/40">
            No product sales for this selected month.
          </div>
        ) : (
          <div className="mt-6 flex h-80 items-end justify-between gap-5">
            {topSellingProducts.map((product: any) => (
              <div key={product.name} className="flex flex-1 flex-col items-center gap-3">
                <p className="text-sm font-semibold">{product.quantity}</p>

                <div
                  className="w-full max-w-12 rounded-t-xl bg-purple-500"
                  style={{
                    height: `${Math.max(30, (product.quantity / maxQuantity) * 210)}px`,
                  }}
                />

                <div className="h-12 w-12 overflow-hidden rounded-xl bg-[#FAFAFA]">
                  {product.imageUrl && (
                    <img
                      src={product.imageUrl}
                      alt={product.name}
                      className="h-full w-full object-cover"
                    />
                  )}
                </div>

                <p className="line-clamp-2 text-center text-xs">{product.name}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-semibold">Sales by Category</h3>

        {categoryList.length === 0 ? (
          <div className="flex h-80 items-center justify-center text-sm text-black/40">
            No category sales for this selected month.
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {categoryList.map(([category, amount], index) => {
              const percentage = totalRevenue
                ? Math.round((amount / totalRevenue) * 100)
                : 0;

              return (
                <div
                  key={category}
                  className="grid grid-cols-[1fr_50px_100px] items-center gap-3 text-sm"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: colors[index] }}
                    />
                    <span className="truncate font-medium">{category}</span>
                  </div>

                  <span className="font-semibold">{percentage}%</span>

                  <span className="text-right text-black/50">
                    GH₵{amount.toLocaleString()}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function OrdersSection({
  orders,
  orderItems,
  setOrders,
}: {
  orders: Order[];
  orderItems: OrderItem[];
  setOrders: React.Dispatch<React.SetStateAction<Order[]>>;
}) {
  const [view, setView] = useState<"received" | "dispatch" | "delivered" | "hold">("received");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  const updateOrderStatus = async (orderId: string, status: string) => {
    const { error } = await supabase
      .from("orders")
      .update({ order_status: status })
      .eq("id", orderId);

    if (error) {
      alert(error.message);
      return;
    }

    setOrders((prev) =>
      prev.map((order) =>
        order.id === orderId ? { ...order, status } : order
      )
    );

    setSelectedOrder(null);
  };

  const fifoOrders = [...orders].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

const receivedOrders = fifoOrders.filter(
  (order) => order.status === "received"
);

  const dispatchOrders = fifoOrders.filter(
    (order) => order.status === "dispatch" || order.status === "shipped"
  );

  const deliveredOrders = fifoOrders.filter(
    (order) => order.status === "delivered"
  );

  const holdOrders = fifoOrders.filter((order) => order.status === "hold");

  const currentOrders =
    view === "received"
      ? receivedOrders
      : view === "dispatch"
      ? dispatchOrders
      : view === "delivered"
      ? deliveredOrders
      : holdOrders;

  const getItems = (orderId: string) =>
    orderItems.filter((item) => item.orderId === orderId);

  return (
    <div>
      <PageHeader
        title="Orders"
        subtitle="Manage received, dispatched, delivered and on-hold orders using FIFO."
      />

     <div className="grid gap-4 md:grid-cols-3">
  <OrderStatCard
    title="Received"
    subtitle="Awaiting dispatch"
    count={receivedOrders.length}
    icon={ClipboardList}
    color="bg-[#FFF8E8] border-yellow-200"
    iconColor="bg-yellow-100 text-yellow-700"
  />

  <OrderStatCard
    title="Dispatch"
    subtitle="Out for delivery / In transit"
    count={dispatchOrders.length}
    icon={Truck}
    color="bg-[#EEF8FF] border-blue-200"
    iconColor="bg-blue-100 text-blue-700"
  />

  <OrderStatCard
    title="Delivered"
    subtitle="Completed orders"
    count={deliveredOrders.length}
    icon={CircleCheck}
    color="bg-[#EFFCF3] border-green-200"
    iconColor="bg-green-100 text-green-700"
  />
</div>

      <div className="mt-8 flex flex-wrap items-center gap-4 border-b border-black/10">
        <OrderTab label="Received" count={receivedOrders.length} active={view === "received"} onClick={() => setView("received")} />
        <OrderTab label="Dispatch" count={dispatchOrders.length} active={view === "dispatch"} onClick={() => setView("dispatch")} />
        <OrderTab label="Delivered" count={deliveredOrders.length} active={view === "delivered"} onClick={() => setView("delivered")} />
        <OrderTab label="On Hold" count={holdOrders.length} active={view === "hold"} onClick={() => setView("hold")} />
      </div>

      <div className="mt-6 space-y-4">
        {currentOrders.length === 0 ? (
          <div className="rounded-3xl border border-black/10 bg-white p-8 text-sm text-black/50">
            No orders in this section.
          </div>
        ) : (
          currentOrders.map((order) => {
            const items = getItems(order.id);

            return (
              <div
                key={order.id}
                onClick={() => setSelectedOrder(order)}
                className={`grid cursor-pointer grid-cols-[1fr_170px_150px_170px] items-center gap-4 rounded-3xl border border-black/10 p-5 shadow-sm transition hover:-translate-y-1 ${
                  order.status === "hold" ? "bg-gray-100 opacity-70" : "bg-white"
                }`}
              >
                <div>
                  <p className="text-sm font-bold">
                    Order #{order.orderNumber || order.id.slice(0, 8)}
                  </p>
                  <p className="mt-1 text-sm text-black/50">
                    Customer: {order.customerName}
                  </p>
                  <p className="mt-2 text-xs text-black/40">
                    {new Date(order.createdAt).toLocaleDateString()} ·{" "}
                    {new Date(order.createdAt).toLocaleTimeString()}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-semibold text-black/40">
                    Items ({items.length})
                  </p>
                  <div className="mt-2 flex gap-2">
                    {items.slice(0, 3).map((item) => (
                      <div key={item.id} className="h-12 w-12 overflow-hidden rounded-xl bg-[#FAFAFA]">
                        {item.productImageUrl && (
                          <img
                            src={item.productImageUrl}
                            alt={item.productName}
                            className="h-full w-full object-cover"
                          />
                        )}
                      </div>
                    ))}
                    {items.length > 3 && (
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#FAFAFA] text-xs font-semibold">
                        +{items.length - 3}
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold text-black/40">Total</p>
                  <p className="mt-2 text-lg font-bold">
                    GH₵{order.totalAmount.toLocaleString()}
                  </p>
                </div>

                <div className="flex justify-end gap-2">
                  {view === "received" && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        updateOrderStatus(order.id, "dispatch");
                      }}
                      className="rounded-full bg-yellow-400 px-5 py-3 text-sm font-semibold text-black"
                    >
                      Dispatch
                    </button>
                  )}

                  {view === "dispatch" && (
                    <>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          updateOrderStatus(order.id, "hold");
                        }}
                        className="rounded-full bg-gray-200 px-5 py-3 text-sm font-semibold"
                      >
                        Hold
                      </button>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          updateOrderStatus(order.id, "delivered");
                        }}
                        className="rounded-full bg-green-500 px-5 py-3 text-sm font-semibold text-white"
                      >
                        Delivered
                      </button>
                    </>
                  )}

                  {view === "delivered" && (
  <>
    <button
      onClick={(e) => {
        e.stopPropagation();
        updateOrderStatus(order.id, "hold");
      }}
      className="rounded-full bg-gray-200 px-5 py-3 text-sm font-semibold"
    >
      Hold
    </button>

    <button
      onClick={async (e) => {
        e.stopPropagation();

        const items = getItems(order.id);

        const { data: completedOrder, error } = await supabase
          .from("completed_orders")
          .insert({
            original_order_id: order.id,
            order_number: order.orderNumber,
            customer_name: order.customerName,
            customer_code: order.id.slice(0, 8).toUpperCase(),
            order_type: "online",
            total_amount: order.totalAmount,
            completed_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (error) {
          alert(error.message);
          return;
        }

        if (items.length > 0) {
          const rows = items.map((item) => ({
            completed_order_id: completedOrder.id,
            product_name: item.productName,
            product_image_url: item.productImageUrl,
            category: item.category,
            quantity: item.quantity,
            price: item.price,
          }));

          const { error: itemsError } = await supabase
            .from("completed_order_items")
            .insert(rows);

          if (itemsError) {
            alert(itemsError.message);
            return;
          }
        }

        await updateOrderStatus(order.id, "completed");
      }}
      className="rounded-full bg-black px-5 py-3 text-sm font-semibold text-white"
    >
      Completed
    </button>
  </>
)}
                </div>
              </div>
            );
          })
        )}
      </div>

      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30 backdrop-blur-sm">
          <aside className="h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold">
                  Order #{selectedOrder.orderNumber || selectedOrder.id.slice(0, 8)}
                </h2>
                <p className="mt-1 text-sm text-black/50">
                  Customer Code: {selectedOrder.id.slice(0, 8).toUpperCase()}
                </p>
              </div>

              <button
                onClick={() => setSelectedOrder(null)}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-black text-white"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-sm text-black/50">
              {new Date(selectedOrder.createdAt).toLocaleDateString()} ·{" "}
              {new Date(selectedOrder.createdAt).toLocaleTimeString()}
            </p>

            <div className="mt-6 space-y-4">
              {getItems(selectedOrder.id).map((item) => (
                <div key={item.id} className="flex items-center gap-4 rounded-2xl bg-[#FAFAFA] p-3">
                  <div className="h-14 w-14 overflow-hidden rounded-xl bg-white">
                    {item.productImageUrl && (
                      <img
                        src={item.productImageUrl}
                        alt={item.productName}
                        className="h-full w-full object-cover"
                      />
                    )}
                  </div>

                  <div className="flex-1">
                    <p className="text-sm font-semibold">{item.productName}</p>
                    <p className="text-xs text-black/50">
                      GH₵{item.price} × {item.quantity}
                    </p>
                  </div>

                  <p className="text-sm font-bold">
                    GH₵{(item.price * item.quantity).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-6 border-t border-black/10 pt-5">
              <div className="flex justify-between text-lg font-bold">
                <span>Total</span>
                <span>GH₵{selectedOrder.totalAmount.toLocaleString()}</span>
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

function OrderStatCard({
  title,
  subtitle,
  count,
  icon: Icon,
  color,
  iconColor,
}: {
  title: string;
  subtitle: string;
  count: number;
  icon: any;
  color: string;
  iconColor: string;
}) {
  return (
    <div className={`rounded-3xl border p-6 ${color}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className={`flex h-14 w-14 items-center justify-center rounded-2xl ${iconColor}`}>
            <Icon size={26} />
          </div>

          <div>
            <h3 className="text-lg font-bold">{title}</h3>
            <p className="mt-1 text-sm text-black/50">{subtitle}</p>
          </div>
        </div>

        <p className="text-4xl font-bold">{count}</p>
      </div>
    </div>
  );
}

function OrderTab({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`border-b-2 px-2 pb-4 text-sm font-semibold ${
        active
          ? "border-black text-black"
          : "border-transparent text-black/40"
      }`}
    >
      {label} ({count})
    </button>
  );
}


function DatabaseSection({
  completedOrders,
  completedOrderItems,
}: {
  completedOrders: CompletedOrder[];
  completedOrderItems: CompletedOrderItem[];
}) {
  const [view, setView] = useState<"all" | "online" | "instore">("all");
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());

  const years = Array.from({ length: 8 }, (_, index) => 2024 + index);

  const filteredOrders = completedOrders
    .filter((order) => {
      const date = new Date(order.completedAt);

      const typeMatch =
        view === "all" ||
        (view === "online" && order.orderType === "online") ||
        (view === "instore" && order.orderType === "instore");

      const dateMatch =
        date.getFullYear() === selectedYear &&
        date.getMonth() === selectedMonth;

      const searchText = `${order.orderNumber} ${order.customerName} ${order.customerCode}`.toLowerCase();
      const searchMatch = searchText.includes(search.toLowerCase());

      return typeMatch && dateMatch && searchMatch;
    })
    .sort(
      (a, b) =>
        new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime()
    );

  const getItems = (completedOrderId: string) =>
    completedOrderItems.filter((item) => item.completedOrderId === completedOrderId);

  return (
    <div>
      <div className="mb-8 flex items-start justify-between gap-4 border-b border-black/10 pb-6">
        <div>
          <h2 className="text-4xl font-semibold">Database</h2>
          <p className="mt-2 text-sm text-black/50">
            Completed online and in-store orders stored in realtime.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div
            className={`flex h-12 items-center overflow-hidden rounded-full border border-black/10 bg-white transition-all duration-500 ${
              searchOpen ? "w-72 px-4" : "w-12 px-0"
            }`}
          >
            {searchOpen && (
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search orders..."
                className="w-full bg-transparent text-sm outline-none"
                autoFocus
              />
            )}

            <button
              onClick={() => {
                if (searchOpen && search) setSearch("");
                else setSearchOpen((prev) => !prev);
              }}
              className="flex h-12 w-12 shrink-0 items-center justify-center"
            >
              {searchOpen && search ? <X size={18} /> : <Search size={18} />}
            </button>
          </div>

          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="h-12 rounded-full border border-black/10 px-5 outline-none"
          >
            {years.map((year) => (
              <option key={year}>{year}</option>
            ))}
          </select>

          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(Number(e.target.value))}
            className="h-12 rounded-full border border-black/10 px-5 outline-none"
          >
            {Array.from({ length: 12 }, (_, index) => (
              <option key={index} value={index}>
                {new Date(2024, index).toLocaleString("default", {
                  month: "long",
                })}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mb-8 flex gap-3">
        <DatabaseTab label="All Orders" active={view === "all"} onClick={() => setView("all")} />
        <DatabaseTab label="Online Orders" active={view === "online"} onClick={() => setView("online")} />
        <DatabaseTab label="Instore Orders" active={view === "instore"} onClick={() => setView("instore")} />
      </div>

      {filteredOrders.length === 0 ? (
        <div className="rounded-3xl border border-black/10 bg-white p-8 text-sm text-black/50">
          No completed orders found for this filter.
        </div>
      ) : (
        <div className="space-y-5">
          {filteredOrders.map((order) => {
            const items = getItems(order.id);
            const date = new Date(order.completedAt);

            return (
              <div
                key={order.id}
                className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm"
              >
                <div className="mb-5 flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-black/35">
                      {date.toLocaleDateString()} · {date.toLocaleTimeString()}
                    </p>

                    <h3 className="mt-2 text-xl font-bold">
                      Order #{order.orderNumber || order.id.slice(0, 8)}
                    </h3>

                    <p className="mt-1 text-sm text-black/50">
                      {order.customerName} · {order.customerCode}
                    </p>
                  </div>

                  <div className="text-right">
                    <span className="rounded-full bg-black px-4 py-2 text-xs font-semibold capitalize text-white">
                      {order.orderType}
                    </span>

                    <p className="mt-4 text-xl font-bold">
                      GH₵{order.totalAmount.toLocaleString()}
                    </p>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 rounded-2xl bg-[#FAFAFA] p-3"
                    >
                      <div className="h-14 w-14 overflow-hidden rounded-xl bg-white">
                        {item.productImageUrl && (
                          <img
                            src={item.productImageUrl}
                            alt={item.productName}
                            className="h-full w-full object-cover"
                          />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">
                          {item.productName}
                        </p>
                        <p className="text-xs text-black/50">
                          GH₵{item.price} × {item.quantity}
                        </p>
                      </div>

                      <p className="text-sm font-bold">
                        GH₵{(item.price * item.quantity).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DatabaseTab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-6 py-3 text-sm font-semibold ${
        active ? "bg-black text-white" : "bg-[#FAFAFA] text-black"
      }`}
    >
      {label}
    </button>
  );
}

function NotificationsSection({
  orders,
  orderItems,
  setOrders,
}: {
  orders: Order[];
  orderItems: OrderItem[];
  setOrders: React.Dispatch<React.SetStateAction<Order[]>>;
}) {
  const paidOrders = [...orders]
    .filter((order) => order.status === "paid" || order.status === "pending_approval")
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const approveOrder = async (orderId: string) => {
    const { error } = await supabase
      .from("orders")
      .update({ order_status: "received" })
      .eq("id", orderId);

    if (error) {
      alert(error.message);
      return;
    }

    setOrders((prev) =>
      prev.map((order) =>
        order.id === orderId ? { ...order, status: "received" } : order
      )
    );
  };

  const getItems = (orderId: string) =>
    orderItems.filter((item) => item.orderId === orderId);

  return (
    <div>
      <PageHeader
        title="Notifications"
        subtitle="Paid online orders waiting for approval. Approve to move them into Received orders."
      />

      {paidOrders.length === 0 ? (
        <div className="rounded-3xl border border-black/10 bg-white p-8 text-sm text-black/50">
          No paid online orders waiting for approval.
        </div>
      ) : (
        <div className="space-y-4">
          {paidOrders.map((order) => {
            const items = getItems(order.id);

            return (
              <div
                key={order.id}
                className="grid grid-cols-[1fr_170px_150px] items-center gap-4 rounded-3xl border border-black/10 bg-white p-5 shadow-sm"
              >
                <div>
                  <p className="text-sm font-bold">
                    Order #{order.orderNumber || order.id.slice(0, 8)}
                  </p>
                  <p className="mt-1 text-sm text-black/50">
                    Customer: {order.customerName}
                  </p>
                  <p className="mt-2 text-xs text-black/40">
                    {new Date(order.createdAt).toLocaleDateString()} ·{" "}
                    {new Date(order.createdAt).toLocaleTimeString()}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-semibold text-black/40">
                    Items ({items.length})
                  </p>
                  <p className="mt-2 text-lg font-bold">
                    GH₵{order.totalAmount.toLocaleString()}
                  </p>
                </div>

                <button
                  onClick={() => approveOrder(order.id)}
                  className="h-12 rounded-full bg-black px-6 text-sm font-semibold text-white"
                >
                  Approve
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


function MembersSection({
  members,
  setMembers,
}: {
  members: Member[];
  setMembers: React.Dispatch<React.SetStateAction<Member[]>>;
}) {
  const [memberView, setMemberView] = useState<"members" | "reminders">("members");
  const [membersPage, setMembersPage] = useState(1);
  const [remindersPage, setRemindersPage] = useState(1);

  const pageSize = 30;
  const today = new Date();

  const getAge = (dob: string) => {
    const birthDate = new Date(dob);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }

    return age;
  };

  const isBirthdayToday = (dob: string) => {
    const birthDate = new Date(dob);
    return birthDate.getMonth() === today.getMonth() && birthDate.getDate() === today.getDate();
  };

  const deleteMember = async (memberId: string) => {
    if (!confirm("Delete this member permanently?")) return;

    const { error } = await supabase.from("members").delete().eq("id", memberId);

    if (error) {
      alert(error.message);
      return;
    }

    setMembers((prev) => prev.filter((member) => member.id !== memberId));
  };

  const activeMembers = members.filter((member) => getAge(member.childDob) < 7);
  const reminderMembers = activeMembers.filter((member) => isBirthdayToday(member.childDob));

  const currentPage = memberView === "members" ? membersPage : remindersPage;
  const currentList = memberView === "members" ? activeMembers : reminderMembers;
  const totalPages = Math.max(1, Math.ceil(currentList.length / pageSize));

  const shownMembers = currentList.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const setPage = (page: number) => {
    if (memberView === "members") setMembersPage(page);
    else setRemindersPage(page);
  };

  return (
    <div>
      <PageHeader
        title="Members"
        subtitle="View Baebe Boo members, birthday reminders and member codes."
      />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-3">
          <button
            onClick={() => setMemberView("members")}
            className={`rounded-full px-6 py-3 text-sm font-semibold ${
              memberView === "members" ? "bg-black text-white" : "bg-[#FAFAFA] text-black"
            }`}
          >
            Members
            <span className="ml-2 rounded-full bg-white/20 px-2 py-0.5">
              {activeMembers.length}
            </span>
          </button>

          <button
            onClick={() => setMemberView("reminders")}
            className={`rounded-full px-6 py-3 text-sm font-semibold ${
              memberView === "reminders" ? "bg-black text-white" : "bg-[#FAFAFA] text-black"
            }`}
          >
            Reminders
            {reminderMembers.length > 0 && (
              <span className="ml-2 rounded-full bg-pink-500 px-2 py-0.5 text-white">
                {reminderMembers.length}
              </span>
            )}
          </button>
        </div>

        <p className="text-sm font-semibold text-black/50">
          Total: {currentList.length} · Page {currentPage} of {totalPages}
        </p>
      </div>

      {shownMembers.length === 0 ? (
        <div className="rounded-3xl border border-black/10 bg-white p-8 text-sm text-black/50">
          No members found for this tab.
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {shownMembers.map((member) => {
            const birthday = isBirthdayToday(member.childDob);
            const age = getAge(member.childDob);

            return (
              <div
                key={member.id}
                className="relative rounded-3xl border border-black/10 bg-white p-6 shadow-sm"
              >
                <button
                  onClick={() => deleteMember(member.id)}
                  className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-red-50 text-red-500 hover:bg-red-500 hover:text-white"
                >
                  <X size={16} />
                </button>

                <div className="mb-5 flex items-start justify-between gap-4 pr-10">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-100 text-blue-600">
                    <UserRound size={25} />
                  </div>

                  {birthday && (
                    <div className="flex items-center gap-2 rounded-full bg-pink-100 px-4 py-2 text-xs font-semibold text-pink-600">
                      <Cake size={15} />
                      Birthday Today
                    </div>
                  )}
                </div>

                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-black/35">
                  {member.memberCode}
                </p>

                <h3 className="mt-2 text-xl font-semibold">
                  {member.childFirstName} {member.childLastName}
                </h3>

                <p className="mt-1 text-sm text-black/50">Age: {age} years</p>

                <div className="mt-5 space-y-2 text-sm text-black/60">
                  <p><span className="font-semibold text-black">Parent:</span> {member.parentName}</p>
                  <p><span className="font-semibold text-black">Phone:</span> {member.phone}</p>
                  <p><span className="font-semibold text-black">Email:</span> {member.email}</p>
                  <p><span className="font-semibold text-black">DOB:</span> {new Date(member.childDob).toLocaleDateString()}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {currentList.length > pageSize && (
        <div className="mt-8 flex items-center justify-center gap-3">
          <button
            disabled={currentPage === 1}
            onClick={() => setPage(currentPage - 1)}
            className="rounded-full border border-black/10 px-5 py-3 text-sm font-semibold disabled:opacity-40"
          >
            Previous
          </button>

          <button
            disabled={currentPage === totalPages}
            onClick={() => setPage(currentPage + 1)}
            className="rounded-full bg-black px-5 py-3 text-sm font-semibold text-white disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}




function DashboardCard({ icon: Icon, label, value, color }: any) {
  return (
    <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-5">
        <div className={`flex h-14 w-14 items-center justify-center rounded-2xl ${color}`}>
          <Icon size={26} />
        </div>

        <div className="min-w-0">
          <p className="text-sm text-black/50">{label}</p>
          <h3 className="mt-2 truncate text-2xl font-bold">{value}</h3>
          <p className="mt-3 flex items-center gap-1 text-xs font-semibold text-green-600">
            <TrendingUp size={14} />
            Live data
          </p>
        </div>
      </div>
    </div>
  );
}


function SettingsSection({
  shops,
  setShops,
  staffMembers,
  setStaffMembers,
}: {
  shops: Shop[];
  setShops: React.Dispatch<React.SetStateAction<Shop[]>>;
  staffMembers: StaffMember[];
  setStaffMembers: React.Dispatch<React.SetStateAction<StaffMember[]>>;
}) {
  const [shopName, setShopName] = useState("");
  const [location, setLocation] = useState("");
  const [staffName, setStaffName] = useState("");
  const [staffContact, setStaffContact] = useState("");

  const [profileFile, setProfileFile] = useState<File | null>(null);
  const [profilePreview, setProfilePreview] = useState("");
const [crop, setCrop] = useState({ x: 0, y: 0 });
const [zoom, setZoom] = useState(1);
const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const createShop = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!shopName || !location || !staffName || !staffContact) {
      setError("Fill shop name, location, staff name and contact.");
      return;
    }

    if (!profileFile) {
      setError("Upload staff profile picture.");
      return;
    }

    try {
      setSaving(true);

      const cleanLocation = location
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");

      const databaseName = `shop_${cleanLocation}`;

     if (!profilePreview || !croppedAreaPixels) {
  setError("Adjust and crop the staff photo first.");
  return;
}

const croppedBlob = await getCroppedImageBlob(
  profilePreview,
  croppedAreaPixels
);

const filePath = `staff/${Date.now()}-${crypto.randomUUID()}.jpg`;

const { error: uploadError } = await supabase.storage
  .from("staff-images")
  .upload(filePath, croppedBlob, {
    contentType: "image/jpeg",
  });

      if (uploadError) {
        setError(uploadError.message);
        return;
      }

      const { data: publicUrlData } = supabase.storage
        .from("staff-images")
        .getPublicUrl(filePath);

      const profileImageUrl = publicUrlData.publicUrl;

      const { data: shopData, error: shopError } = await supabase
        .from("shops")
        .insert({
          name: shopName.trim(),
          location: location.trim(),
          database_name: databaseName,
          is_active: true,
        })
        .select()
        .single();

      if (shopError) {
        setError(shopError.message);
        return;
      }

      const { data: staffData, error: staffError } = await supabase
        .from("shop_staff")
        .insert({
          shop_id: shopData.id,
          staff_name: staffName.trim(),
          staff_contact: staffContact.trim(),
          profile_image_url: profileImageUrl,
        })
        .select()
        .single();

      if (staffError) {
        setError(staffError.message);
        return;
      }

      setShops((prev) => [
        ...prev,
        {
          id: shopData.id,
          name: shopData.name,
          location: shopData.location,
          databaseName: shopData.database_name,
        },
      ]);

      setStaffMembers((prev) => [
        {
          id: staffData.id,
          shopId: shopData.id,
          shopName: shopData.name,
          location: shopData.location,
          databaseName: shopData.database_name,
          staffName: staffData.staff_name,
          staffContact: staffData.staff_contact,
          profileImageUrl,
        },
        ...prev,
      ]);

      setShopName("");
      setLocation("");
      setStaffName("");
      setStaffContact("");
      setProfileFile(null);
      setProfilePreview("");
     setCrop({ x: 0, y: 0 });
setZoom(1);
setCroppedAreaPixels(null);
    } finally {
      setSaving(false);
    }
  };

  const deleteRow = async (staffId: string, shopId: string) => {
    if (!confirm("Delete this shop and staff row?")) return;

    const { error: staffError } = await supabase
      .from("shop_staff")
      .delete()
      .eq("id", staffId);

    if (staffError) {
      alert(staffError.message);
      return;
    }

    const { error: shopError } = await supabase
      .from("shops")
      .delete()
      .eq("id", shopId);

    if (shopError) {
      alert(shopError.message);
      return;
    }

    setStaffMembers((prev) => prev.filter((item) => item.id !== staffId));
    setShops((prev) => prev.filter((shop) => shop.id !== shopId));
  };

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Create shop locations, assign staff and manage store access."
      />

      {error && (
        <div className="mb-6 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      <form
        onSubmit={createShop}
        className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm"
      >
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h3 className="text-xl font-semibold">Create New Shop Location</h3>
            <p className="mt-1 text-sm text-black/45">
              Add shop details and upload staff photo.
            </p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <div className="rounded-3xl bg-[#FAFAFA] p-5">
            <p className="mb-4 text-sm font-semibold">Staff Photo</p>

            <div className="relative h-72 overflow-hidden rounded-3xl bg-white">
              {profilePreview ? (
                <Cropper
                  image={profilePreview}
                  crop={crop}
                  zoom={zoom}
                  aspect={1}
                  cropShape="round"
                  showGrid={false}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={(_, croppedPixels) => {
  setCroppedAreaPixels(croppedPixels);
}}
                />
              ) : (
                <label className="flex h-full cursor-pointer flex-col items-center justify-center text-center">
                  <UploadCloud size={34} />
                  <p className="mt-3 text-sm font-semibold">Upload Photo</p>
                  <p className="mt-1 text-xs text-black/40">JPG, PNG or WEBP</p>

                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;

                    setProfileFile(file);
                    setProfilePreview(URL.createObjectURL(file));
                    setCrop({ x: 0, y: 0 });
                    setZoom(1);
                    setCroppedAreaPixels(null);
                      setCroppedAreaPixels(null);
                    }}
                  />
                </label>
              )}
            </div>

            {profilePreview && (
              <div className="mt-4">
                <div className="flex items-center justify-between text-xs font-semibold text-black/50">
                  <span>Zoom</span>
                  <span>{zoom.toFixed(1)}x</span>
                </div>

                <input
                  type="range"
                  min="1"
                  max="3"
                  step="0.1"
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="mt-2 w-full"
                />

                <label className="mt-4 flex cursor-pointer items-center justify-center rounded-full border border-black/10 bg-white px-4 py-3 text-xs font-semibold">
                  Change Photo
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;

                      setProfileFile(file);
                      setProfilePreview(URL.createObjectURL(file));
                      setCrop({ x: 0, y: 0 });
                      setZoom(1);
                      setCroppedAreaPixels(null);
                    }}
                  />
                </label>
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-black/10 p-5">
            <p className="mb-4 text-sm font-semibold">Shop & Staff Details</p>

            <div className="grid gap-4 md:grid-cols-2">
              <Input
                value={shopName}
                onChange={setShopName}
                placeholder="Shop name e.g. Baebe Boo Tema"
              />

              <Input
                value={location}
                onChange={setLocation}
                placeholder="Location e.g. Tema"
              />

              <Input
                value={staffName}
                onChange={setStaffName}
                placeholder="Staff/Admin name"
              />

              <Input
                value={staffContact}
                onChange={setStaffContact}
                placeholder="Staff/Admin contact"
              />
            </div>

            <div className="mt-5 rounded-2xl bg-[#FAFAFA] px-5 py-4 text-sm text-black/50">
              Database name will be created automatically from the location.
            </div>

            <button
              disabled={saving}
              className="mt-6 flex h-14 items-center gap-2 rounded-full bg-black px-8 text-sm font-semibold text-white disabled:opacity-50"
            >
              <Plus size={18} />
              {saving ? "Creating..." : "Create Shop Database"}
            </button>
          </div>
        </div>
      </form>

      <div className="mt-8 rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
        <h3 className="text-xl font-semibold">Store Locations Sheet</h3>

        <div className="mt-5 overflow-hidden rounded-2xl border border-black/10">
          <div className="grid grid-cols-[80px_1.2fr_1fr_1fr_1fr_1fr_120px] bg-[#FAFAFA] px-4 py-3 text-xs font-semibold uppercase text-black/50">
            <span>Photo</span>
            <span>Shop</span>
            <span>Location</span>
            <span>Database</span>
            <span>Staff</span>
            <span>Contact</span>
            <span>Actions</span>
          </div>

          {staffMembers.length === 0 ? (
            <div className="px-4 py-6 text-sm text-black/50">
              No staff or shop rows yet.
            </div>
          ) : (
            staffMembers.map((staff) => (
              <div
                key={staff.id}
                className="grid grid-cols-[80px_1.2fr_1fr_1fr_1fr_1fr_120px] items-center border-t border-black/10 px-4 py-4 text-sm"
              >
                <div className="h-12 w-12 overflow-hidden rounded-full bg-[#FAFAFA]">
                  {staff.profileImageUrl && (
                    <img
                      src={staff.profileImageUrl}
                      alt={staff.staffName}
                      className="h-full w-full object-cover"
                    />
                  )}
                </div>

                <span className="font-semibold">{staff.shopName}</span>
                <span>{staff.location}</span>
                <span className="text-black/50">{staff.databaseName}</span>
                <span>{staff.staffName}</span>
                <span>{staff.staffContact}</span>

                <div className="flex gap-3">
                  <button
                    onClick={() =>
                      alert("Update staff/shop modal will be added next.")
                    }
                    className="text-xs font-semibold text-black"
                  >
                    Update
                  </button>

                  <button
                    onClick={() => deleteRow(staff.id, staff.shopId)}
                    className="text-xs font-semibold text-red-500"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-8 border-b border-black/10 pb-6">
      <h2 className="text-4xl font-semibold">{title}</h2>
      <p className="mt-2 text-sm text-black/50">{subtitle}</p>
    </div>
  );
}

function Input({
  value,
  onChange,
  placeholder,
  type = "text",
  readOnly = false,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: string;
  readOnly?: boolean;
}) {
  return (
    <input
      value={value}
      type={type}
      readOnly={readOnly}
      min={type === "number" ? "0" : undefined}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`h-14 rounded-full border border-black/10 px-5 outline-none ${
        readOnly ? "bg-[#FAFAFA] font-semibold text-black/60" : ""
      }`}
    />
  );
}

function Select({
  value,
  onChange,
  placeholder,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  options: string[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-14 rounded-full border border-black/10 px-5 outline-none"
    >
      <option value="">{placeholder}</option>
      {options.map((option) => (
        <option key={option} value={option}>{option}</option>
      ))}
    </select>
  );
}