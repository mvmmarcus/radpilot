import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { CopilotIssueRepository } from "../application/copilot-service";
import type { CopilotIssue, CopilotIssueDraft } from "../domain/issue";
import { toCopilotIssue, toCopilotIssueInsert } from "./mappers";

/**
 * Supabase-backed CopilotIssueRepository.
 *
 * `replaceOpenIssues` deletes the report's unresolved issues, then inserts
 * the fresh draft set, matching the RLS policy "copilot_issues: delete open
 * issues" (`using (not resolved)`) -- resolved issues are never deleted, so
 * they remain as history.
 */
export class SupabaseCopilotIssueRepository implements CopilotIssueRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async listOpenIssues(reportId: string): Promise<CopilotIssue[]> {
    const { data, error } = await this.client
      .from("copilot_issues")
      .select("*")
      .eq("report_id", reportId)
      .eq("resolved", false);
    if (error) throw new Error(`Failed to list open copilot issues: ${error.message}`);
    return (data ?? []).map(toCopilotIssue);
  }

  async listResolvedIssues(reportId: string): Promise<CopilotIssue[]> {
    const { data, error } = await this.client
      .from("copilot_issues")
      .select("*")
      .eq("report_id", reportId)
      .eq("resolved", true);
    if (error) throw new Error(`Failed to list resolved copilot issues: ${error.message}`);
    return (data ?? []).map(toCopilotIssue);
  }

  async replaceOpenIssues(reportId: string, drafts: CopilotIssueDraft[]): Promise<CopilotIssue[]> {
    const { error: deleteError } = await this.client
      .from("copilot_issues")
      .delete()
      .eq("report_id", reportId)
      .eq("resolved", false);
    if (deleteError) throw new Error(`Failed to clear open copilot issues: ${deleteError.message}`);

    if (drafts.length > 0) {
      const { error: insertError } = await this.client
        .from("copilot_issues")
        .insert(drafts.map((draft) => toCopilotIssueInsert(reportId, draft)));
      if (insertError) throw new Error(`Failed to insert copilot issues: ${insertError.message}`);
    }

    const { data, error } = await this.client.from("copilot_issues").select("*").eq("report_id", reportId);
    if (error) throw new Error(`Failed to reload copilot issues: ${error.message}`);
    return (data ?? []).map(toCopilotIssue);
  }

  async resolveIssue(issueId: string, resolvedBy: string): Promise<void> {
    const { error } = await this.client
      .from("copilot_issues")
      .update({ resolved: true, resolved_by: resolvedBy, resolved_at: new Date().toISOString() })
      .eq("id", issueId);
    if (error) throw new Error(`Failed to resolve copilot issue ${issueId}: ${error.message}`);
  }
}
