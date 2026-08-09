export type Supplier = {
  id: string;
  name: string;
  contactName?: string;
  email?: string;
  phone?: string;
  address?: string;
  paymentTerms?: string;
  notes?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PurchaseOrderItem = {
  id: string;
  variantId: string;
  productName: string;
  sku: string;
  quantity: number;
  unitCost: number;
  receivedQuantity: number;
  lineTotal: number;
};

export type PurchaseOrder = {
  id: string;
  supplierId: string;
  supplierName: string;
  shopId: string | null;
  shopName: string | null;
  referenceNumber: string;
  status: "draft" | "sent" | "partial" | "received" | "cancelled";
  totalAmount: number;
  expectedDeliveryDate: string | null;
  receivedAt: string | null;
  notes: string;
  items: PurchaseOrderItem[];
  createdAt: string;
  updatedAt: string;
};

export type SupplierBalance = {
  supplierId: string;
  supplierName: string;
  totalPurchaseOrders: number;
  receivedValue: number;
  outstandingBalance: number;
};

export function calculatePurchaseOrderTotal(items: { quantity: number; unitCost: number }[]) {
  return items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);
}

export function canReceivePurchaseOrder(status: PurchaseOrder["status"]) {
  return status !== "received" && status !== "cancelled";
}
