import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Testing Library auto-cleans only when Vitest runs with `globals: true`, and
// this project runs without it. Without an explicit hook every render stays in
// the document for the rest of the file, so the second test in a file that
// renders the same component fails with "found multiple elements" — a failure
// that reads like a component bug rather than leaked state.
afterEach(cleanup);
