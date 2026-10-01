import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Modules are reached only through their public entry points:
//   @/modules/<name>         domain types, schemas and pure functions (safe anywhere)
//   @/modules/<name>/server  application use cases wired to infrastructure (server only)
//   @/modules/<name>/ui      React components
// Inside a module, use relative imports.
const moduleInternals = {
  group: [
    "@/modules/*/domain",
    "@/modules/*/domain/**",
    "@/modules/*/application",
    "@/modules/*/application/**",
    "@/modules/*/infrastructure",
    "@/modules/*/infrastructure/**",
    "@/modules/*/ui/**",
  ],
  message:
    "Import another module through its public entry point: @/modules/<name>, @/modules/<name>/server or @/modules/<name>/ui.",
};

// domain/ holds pure business rules. Keeping it free of frameworks and I/O
// is what makes it unit-testable and portable.
const domainForbidden = {
  group: [
    "react",
    "react-dom",
    "next",
    "next/**",
    "@supabase/**",
    "ai",
    "@ai-sdk/**",
    "@tiptap/**",
    "@cornerstonejs/**",
    "@react-pdf/**",
    "@/lib/**",
    "@/components/**",
    "@/modules/*/server",
    "@/modules/*/ui",
  ],
  message: "domain/ must stay framework-free: only zod, plain TypeScript and other modules' domain entry points.",
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [moduleInternals] }],
    },
  },
  {
    files: ["src/modules/*/domain/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [moduleInternals, domainForbidden] }],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated files:
    "src/lib/supabase/database.types.ts",
    "playwright-report/**",
    "test-results/**",
  ]),
]);

export default eslintConfig;
