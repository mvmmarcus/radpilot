import type { Json, Tables, TablesInsert } from "@/lib/supabase/database.types";
import { parseRow, toIsoDateTime } from "@/lib/supabase/mapping";
import { CopilotIssueSchema, type CopilotIssue, type CopilotIssueDraft } from "../domain/issue";

export type CopilotIssueRow = Tables<"copilot_issues">;
export type CopilotIssueInsert = TablesInsert<"copilot_issues">;

export function toCopilotIssue(row: CopilotIssueRow): CopilotIssue {
  return parseRow(
    CopilotIssueSchema,
    {
      id: row.id,
      reportId: row.report_id,
      source: row.source,
      ruleId: row.rule_id,
      severity: row.severity,
      category: row.category,
      message: row.message,
      span: row.span,
      suggestedFix: row.suggested_fix,
      resolved: row.resolved,
      createdAt: toIsoDateTime(row.created_at),
    },
    "copilot_issues",
    row.id,
  );
}

/** Insert payload for a draft produced by a rule, the LLM review or a guideline. */
export function toCopilotIssueInsert(reportId: string, draft: CopilotIssueDraft): CopilotIssueInsert {
  return {
    report_id: reportId,
    source: draft.source,
    rule_id: draft.ruleId,
    severity: draft.severity,
    category: draft.category,
    message: draft.message,
    span: draft.span as Json,
    suggested_fix: draft.suggestedFix as Json,
  };
}
