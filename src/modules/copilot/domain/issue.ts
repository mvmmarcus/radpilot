import { z } from "zod";
import type { ReportContent } from "@/modules/reports";
import type { BodyPart, Modality, PatientSex } from "@/modules/studies";
import { SectionKeySchema } from "@/modules/templates";

export const ISSUE_SEVERITIES = ["blocking", "warning", "info"] as const;
export const IssueSeveritySchema = z.enum(ISSUE_SEVERITIES);
export type IssueSeverity = z.infer<typeof IssueSeveritySchema>;

/** rule = deterministic rules engine, llm = LLM review, guideline = guideline calculators. */
export const ISSUE_SOURCES = ["rule", "llm", "guideline"] as const;
export const IssueSourceSchema = z.enum(ISSUE_SOURCES);
export type IssueSource = z.infer<typeof IssueSourceSchema>;

export const ISSUE_CATEGORIES = [
  "laterality",
  "sex_mismatch",
  "missing_from_impression",
  "critical_finding",
  "measurement",
  "guideline",
  "clarity",
  "other",
] as const;
export const IssueCategorySchema = z.enum(ISSUE_CATEGORIES);
export type IssueCategory = z.infer<typeof IssueCategorySchema>;

/** A character range inside one section's text. `quote` lets the UI re-find it after edits. */
export const TextSpanSchema = z
  .object({
    section: SectionKeySchema,
    start: z.number().int().nonnegative(),
    end: z.number().int().nonnegative(),
    quote: z.string(),
  })
  .refine((span) => span.end >= span.start, { message: "end must be >= start" });
export type TextSpan = z.infer<typeof TextSpanSchema>;

/** A one-click fix. Applying it is a pure function over ReportContent. */
export const SuggestedFixSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("replace"), span: TextSpanSchema, text: z.string() }),
  z.object({ kind: z.literal("append"), section: SectionKeySchema, text: z.string().min(1) }),
]);
export type SuggestedFix = z.infer<typeof SuggestedFixSchema>;

export const CopilotIssueSchema = z.object({
  id: z.uuid(),
  reportId: z.uuid(),
  source: IssueSourceSchema,
  /** Stable id of the rule or guideline, e.g. "laterality-conflict". Null for LLM issues. */
  ruleId: z.string().nullable(),
  severity: IssueSeveritySchema,
  category: IssueCategorySchema,
  message: z.string().min(1),
  span: TextSpanSchema.nullable(),
  suggestedFix: SuggestedFixSchema.nullable(),
  resolved: z.boolean(),
  createdAt: z.iso.datetime({ offset: true }),
});
export type CopilotIssue = z.infer<typeof CopilotIssueSchema>;

/** What rules, LLM review and guidelines produce, before persistence assigns ids. */
export const CopilotIssueDraftSchema = CopilotIssueSchema.omit({
  id: true,
  reportId: true,
  resolved: true,
  createdAt: true,
});
export type CopilotIssueDraft = z.infer<typeof CopilotIssueDraftSchema>;

/** Everything a deterministic rule may look at. No I/O. */
export interface RuleContext {
  content: ReportContent;
  study: { modality: Modality; bodyPart: BodyPart; indication: string };
  patient: { sex: PatientSex; ageYears: number };
}

/** The contract every deterministic copilot rule implements. */
export interface CopilotRule {
  id: string;
  description: string;
  run(ctx: RuleContext): CopilotIssueDraft[];
}

export function isBlockingOpen(issue: Pick<CopilotIssue, "severity" | "resolved">): boolean {
  return issue.severity === "blocking" && !issue.resolved;
}
