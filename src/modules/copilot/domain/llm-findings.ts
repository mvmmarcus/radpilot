import type { ReportContent } from "@/modules/reports";
import { SectionKeySchema } from "@/modules/templates";
import type { CopilotIssueDraft, TextSpan } from "./issue";

/** What the LLM review reports for one problem (structurally the ai module's ReviewFinding). */
export interface ReviewFinding {
  section: string;
  quote: string;
  message: string;
  severity: "warning" | "info";
}

/**
 * Turns the LLM review's findings into issue drafts (source "llm"). The model
 * never blocks signing: severity is whatever it reported, which is limited
 * to warning or info. A quote that cannot be found in its section (the model
 * paraphrased, or named an unknown section) yields an issue without a span
 * rather than being dropped.
 */
export function llmFindingsToDrafts(findings: ReviewFinding[], content: ReportContent): CopilotIssueDraft[] {
  return findings
    .filter((finding) => finding.message.trim().length > 0)
    .map((finding) => ({
      source: "llm" as const,
      ruleId: null,
      severity: finding.severity,
      category: "clarity" as const,
      message: finding.message.trim(),
      span: locate(finding, content),
      suggestedFix: null,
    }));
}

function locate(finding: ReviewFinding, content: ReportContent): TextSpan | null {
  const section = SectionKeySchema.safeParse(finding.section);
  if (!section.success || finding.quote.length === 0) return null;
  const text = content.sections[section.data]?.text ?? "";
  const start = text.indexOf(finding.quote);
  if (start === -1) return null;
  return { section: section.data, start, end: start + finding.quote.length, quote: finding.quote };
}
