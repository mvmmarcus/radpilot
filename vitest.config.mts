import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    // Domain and application layers are framework-free, so plain Node is enough.
    // Component tests can opt in per file with `// @vitest-environment jsdom`
    // once jsdom is installed.
    environment: "node",
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts", "evals/**/*.test.ts"],
  },
});
