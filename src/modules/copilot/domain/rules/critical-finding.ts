import type { SectionKey } from "@/modules/templates";
import type { CopilotIssueDraft, CopilotRule, RuleContext } from "../issue";
import { findSpan } from "./text-scan";

/**
 * Flags critical findings that require immediate communication to the
 * referring clinician (ACR Actionable Findings framework, Category 1):
 * pulmonary embolism, pneumothorax, intracranial hemorrhage, free
 * intraperitoneal air and aortic dissection.
 *
 * Blocking until acknowledged: the lifecycle use case also sets
 * report.is_critical so the UI can show a persistent banner.
 */

const CRITICAL_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /\bpulmonary embol(?:us|ism)\b/i, label: "pulmonary embolism" },
  // Uppercase-only: "PE" is too ambiguous as a case-insensitive match (e.g. "pe").
  { pattern: /\bPE\b/, label: "pulmonary embolism" },
  { pattern: /\bpneumothorax\b/i, label: "pneumothorax" },
  {
    pattern: /\b(?:subdural|epidural|subarachnoid|intraparenchymal|intracranial)\s+hem(?:orrhage|atoma)\b/i,
    label: "intracranial hemorrhage",
  },
  { pattern: /\bfree (?:intraperitoneal )?air\b|\bpneumoperitoneum\b/i, label: "free air" },
  { pattern: /\baortic dissection\b/i, label: "aortic dissection" },
];

const SECTIONS_TO_CHECK: SectionKey[] = ["findings", "impression"];

function run(ctx: RuleContext): CopilotIssueDraft[] {
  const seen = new Set<string>();
  const drafts: CopilotIssueDraft[] = [];

  for (const section of SECTIONS_TO_CHECK) {
    const text = ctx.content.sections[section]?.text ?? "";
    for (const { pattern, label } of CRITICAL_PATTERNS) {
      if (seen.has(label)) continue;
      const span = findSpan(section, text, pattern);
      if (!span) continue;
      seen.add(label);
      drafts.push({
        source: "rule",
        ruleId: "critical-finding",
        severity: "blocking",
        category: "critical_finding",
        message: `Critical finding detected: ${label}. Confirm direct communication with the referring clinician before signing.`,
        span,
        suggestedFix: null,
      });
    }
  }

  return drafts;
}

export const criticalFindingRule: CopilotRule = {
  id: "critical-finding",
  description:
    "Flags critical findings (PE, pneumothorax, intracranial hemorrhage, free air, aortic dissection) that block signing until acknowledged.",
  run,
};
