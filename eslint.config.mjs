import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import reactHooks from "eslint-plugin-react-hooks";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".next-static-archive/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Standalone screenshot utility; not part of the Next.js app bundle.
    "screenshots/capture.js",
  ]),
  {
    plugins: { "react-hooks": reactHooks },
    rules: {
      // Existing screens predate strict linting; keep these visible as warnings
      // while the large admin/counter surfaces are migrated to generated types.
      "@typescript-eslint/no-explicit-any": "warn",
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);

export default eslintConfig;
