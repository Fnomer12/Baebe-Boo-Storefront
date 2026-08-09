// Vitest alias target for the "server-only" package. The real package throws
// when imported outside React Server Components; unit tests exercise server
// modules directly, so the guard is stubbed out here.
export {};
