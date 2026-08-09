import "server-only";

/**
 * One error class for the whole counter server layer.
 *
 * The admin modules each carry their own error class because they are large
 * and independently owned. The four counter modules are small and always
 * surface through the same handful of routes, so a single class with a status
 * keeps the route-level mapping to one `instanceof`.
 */
export class CounterError extends Error {
  constructor(
    message: string,
    readonly status = 500,
  ) {
    super(message);
    this.name = "CounterError";
  }
}

export function databaseFailure(message: string): never {
  throw new CounterError(message, 500);
}

export function notFound(message: string): never {
  throw new CounterError(message, 404);
}

export function conflict(message: string): never {
  throw new CounterError(message, 409);
}

export function unavailable(message: string): never {
  throw new CounterError(message, 503);
}
