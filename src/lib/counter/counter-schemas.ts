import { z } from "zod";

/**
 * None of these schemas carries a shop id or a staff id.
 *
 * Both are read from the server session in the route handler
 * (`authorization.counter.staff.*`). Accepting either from the request body is
 * exactly the regression this rewrite exists to remove, so adding one here
 * should fail review.
 */

export const counterSaleItemSchema = z.object({
  variantId: z.uuid(),
  quantity: z.int().min(1).max(500),
});

export const counterSaleCreateSchema = z.object({
  items: z.array(counterSaleItemSchema).min(1).max(100),
  paymentMethod: z.enum(["cash", "visa", "momo"]),
  customerName: z.string().trim().max(120).optional(),
  customerPhone: z.string().trim().max(24).optional(),
  /**
   * Account holder the sale earns loyalty for. Resolved via the member lookup
   * (phone/email → customer_profiles.user_id); never free-text, so a cashier
   * cannot attach a sale to an arbitrary account.
   */
  customerUserId: z.uuid().optional(),
  /**
   * Supplied by the till so a retried "Complete sale" returns the original
   * order instead of ringing up a second one.
   */
  idempotencyKey: z.string().trim().min(8).max(128).optional(),
});

export type CounterSaleCreateInput = z.infer<typeof counterSaleCreateSchema>;

export const counterOrderIdSchema = z.uuid();

export const counterSalesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type CounterSalesQuery = z.infer<typeof counterSalesQuerySchema>;
