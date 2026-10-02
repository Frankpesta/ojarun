export const ORDER_STATUSES = [
  "pending_payment",
  "paid",
  "assigned",
  "shopping",
  "en_route",
  "arrived",
  "completed",
  "cancelled",
  "expired",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ITEM_STATUSES = ["pending", "bought", "adjusted", "skipped", "rejected"] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

export const ROLES = ["customer", "shopper", "ops"] as const;
export type Role = (typeof ROLES)[number];

export const ORDER_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  pending_payment: ["paid", "expired", "cancelled"],
  paid: ["assigned", "cancelled"],
  assigned: ["shopping", "cancelled"],
  shopping: ["en_route"],
  en_route: ["arrived"],
  arrived: ["completed"],
  completed: [],
  cancelled: [],
  expired: [],
};

export const ITEM_TRANSITIONS: Readonly<Record<ItemStatus, readonly ItemStatus[]>> = {
  pending: ["bought", "adjusted", "skipped"],
  bought: ["rejected", "adjusted", "skipped"],
  adjusted: ["rejected", "bought", "skipped"],
  skipped: ["bought", "adjusted"],
  rejected: ["bought", "adjusted"],
};

export function canTransitionOrder(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}

export function canTransitionItem(from: ItemStatus, to: ItemStatus): boolean {
  return ITEM_TRANSITIONS[from].includes(to);
}

/** Customers may cancel (free) until the shopper taps Start shopping. */
export const CANCELLABLE_STATUSES: readonly OrderStatus[] = ["pending_payment", "paid", "assigned"];

/** Customer-facing order timeline labels. */
export const ORDER_STATUS_LABEL: Readonly<Record<OrderStatus, string>> = {
  pending_payment: "Awaiting payment",
  paid: "Order confirmed",
  assigned: "Shopper assigned",
  shopping: "Shopping started",
  en_route: "On the way",
  arrived: "At your door",
  completed: "Delivered",
  cancelled: "Cancelled",
  expired: "Payment not completed",
};

export const ITEM_STATUS_LABEL: Readonly<Record<ItemStatus, string>> = {
  pending: "Waiting",
  bought: "Bought",
  adjusted: "Adjusted",
  skipped: "Not available",
  rejected: "Rejected",
};
