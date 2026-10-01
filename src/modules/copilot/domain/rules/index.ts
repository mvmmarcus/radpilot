import type { CopilotRule } from "../issue";
import { criticalFindingRule } from "./critical-finding";
import { findingMissingFromImpressionRule } from "./finding-missing-from-impression";
import { guidelineSuggestionRule } from "./guideline-suggestion";
import { lateralityConflictRule } from "./laterality-conflict";
import { measurementUnitsRule } from "./measurement-units";
import { sexMismatchRule } from "./sex-mismatch";

export { criticalFindingRule } from "./critical-finding";
export { findingMissingFromImpressionRule } from "./finding-missing-from-impression";
export { guidelineSuggestionRule } from "./guideline-suggestion";
export { lateralityConflictRule } from "./laterality-conflict";
export { measurementUnitsRule } from "./measurement-units";
export { sexMismatchRule } from "./sex-mismatch";

/** Every deterministic copilot rule, run in this order by CopilotService. */
export const ALL_RULES: CopilotRule[] = [
  criticalFindingRule,
  lateralityConflictRule,
  sexMismatchRule,
  findingMissingFromImpressionRule,
  measurementUnitsRule,
  guidelineSuggestionRule,
];
