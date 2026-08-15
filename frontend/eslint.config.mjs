import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Existing API-boundary code is being migrated incrementally to generated
      // schemas. Keep these visible without allowing legacy typing debt to
      // block security patches and production builds.
      "@typescript-eslint/no-explicit-any": "warn",
      // Data-loading effects are replaced with a shared query cache in the
      // dedicated frontend data-flow phase. This rule remains visible until
      // that migration is complete.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
