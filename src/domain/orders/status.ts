export type OrderStatus =
  | "pending_payment"
  | "payment_failed"
  | "received"
  | "processing"
  | "on_hold"
  | "dispatched"
  | "shipped"
  | "delivered"
  | "completed"
  | "cancelled"
  | "refunded";

export type ShippingStatus = "pending" | "shipped" | "delivered" | "cancelled";

const allowedTransitions: Record<OrderStatus, readonly OrderStatus[]> = {
  pending_payment: ["payment_failed", "received", "cancelled"],
  payment_failed: ["pending_payment", "cancelled"],
  received: ["processing", "on_hold", "cancelled", "refunded"],
  processing: ["on_hold", "dispatched", "shipped", "cancelled", "refunded"],
  on_hold: ["processing", "cancelled", "refunded"],
  dispatched: ["shipped", "delivered", "refunded"],
  shipped: ["delivered", "refunded"],
  delivered: ["completed", "refunded"],
  completed: [],
  cancelled: [],
  refunded: [],
};

type CurrentOrderState = {
  orderStatus: OrderStatus;
  shippingStatus: ShippingStatus;
};

export function transitionOrder(
  current: CurrentOrderState,
  next: OrderStatus,
  occurredAt: Date,
) {
  if (!allowedTransitions[current.orderStatus].includes(next)) {
    throw new Error(`Cannot transition order from ${current.orderStatus} to ${next}`);
  }

  if (next === "dispatched" || next === "shipped") {
    return {
      orderStatus: next,
      shippingStatus: "shipped" as const,
      shippedAt: occurredAt.toISOString(),
    };
  }

  if (next === "delivered" || next === "completed") {
    return {
      orderStatus: next,
      shippingStatus: "delivered" as const,
      deliveredAt: occurredAt.toISOString(),
    };
  }

  if (next === "cancelled" || next === "refunded") {
    return {
      orderStatus: next,
      shippingStatus: "cancelled" as const,
    };
  }

  return { orderStatus: next, shippingStatus: current.shippingStatus };
}
