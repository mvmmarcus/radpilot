// Browser stand-in for Node built-ins (`fs`, `path`) that the Cornerstone
// WASM codecs require inside an `ENVIRONMENT_IS_NODE` branch they never take
// in the browser. Aliased in next.config.ts.
module.exports = {};
