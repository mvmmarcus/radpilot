/**
 * Minimal structured logger (JSON lines on the server, console in the browser).
 *
 * PHI policy (see docs/adr/0004-phi-policy.md): never log patient names, MRNs,
 * report text or prompts. Log ids (study_id, report_id, generation_id) instead.
 */
type Level = "debug" | "info" | "warn" | "error";
type Fields = Record<string, unknown>;

const LEVEL_ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const minLevel: Level = process.env.NODE_ENV === "production" ? "info" : "debug";

function write(level: Level, msg: string, fields?: Fields) {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) return;
  const entry = { level, msg, time: new Date().toISOString(), ...fields };
  const line = typeof window === "undefined" ? JSON.stringify(entry) : entry;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (msg: string, fields?: Fields) => write("debug", msg, fields),
  info: (msg: string, fields?: Fields) => write("info", msg, fields),
  warn: (msg: string, fields?: Fields) => write("warn", msg, fields),
  error: (msg: string, fields?: Fields) => write("error", msg, fields),
};
