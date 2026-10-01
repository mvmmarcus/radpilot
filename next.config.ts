import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    resolveAlias: {
      // The Cornerstone WASM codecs (Emscripten output) `require("fs")` and
      // `require("path")` in a Node-only branch; give the browser bundle an
      // empty module so they resolve.
      fs: { browser: "./turbopack/empty-module.cjs" },
      path: { browser: "./turbopack/empty-module.cjs" },
    },
    rules: {
      // Breaks a self-referencing worker graph in @cornerstonejs/tools that
      // otherwise hangs `next build`. See the loader for details.
      "registerComputeWorker.js": {
        condition: { path: /@cornerstonejs\/tools\/dist\/esm\/utilities\/registerComputeWorker\.js$/ },
        loaders: [require.resolve("./turbopack/cornerstone-compute-worker-loader.cjs")],
      },
    },
  },
};

export default nextConfig;
