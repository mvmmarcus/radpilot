// Turbopack loader for @cornerstonejs/tools' registerComputeWorker.js.
//
// That file spawns `workers/computeWorker.js`, and the worker imports
// `utilities/segmentation`, which imports registerComputeWorker.js again. The
// worker's module graph therefore contains its own entry point, and
// `next build` under Turbopack never finishes "Creating an optimized
// production build" (no error, it just stalls).
//
// The compute worker only backs segmentation statistics, which the reading
// room viewer does not use (pan / zoom / window-level / length), so the
// worker factory is replaced with one that fails loudly if anything ever
// asks for it.
const WORKER_CONSTRUCTION = /new Worker\(new URL\('\.\.\/workers\/computeWorker\.js', import\.meta\.url\), \{[^}]*\}\)/;

module.exports = function cornerstoneComputeWorkerLoader(source) {
  if (!WORKER_CONSTRUCTION.test(source)) {
    throw new Error(
      "cornerstone-compute-worker-loader: registerComputeWorker.js no longer matches the expected worker construction. " +
        "Re-check whether @cornerstonejs/tools still needs this workaround.",
    );
  }
  return source.replace(
    WORKER_CONSTRUCTION,
    `(() => { throw new Error("The Cornerstone compute worker is disabled in this build (see turbopack/cornerstone-compute-worker-loader.cjs)."); })()`,
  );
};
