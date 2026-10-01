// Server-only entry point: application use cases wired to infrastructure
// (Supabase repositories, LLM adapters). Import from Server Components,
// Server Functions and Route Handlers only.
export {
  loadSeriesForViewer,
  type LoadedInstance,
  type LoadedSeries,
  type LoadSeriesResult,
} from "./application/loadSeries";
