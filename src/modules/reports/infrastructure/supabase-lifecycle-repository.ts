import type { SupabaseClient } from "@supabase/supabase-js";
import type { CopilotIssue } from "@/modules/copilot";
import { toCopilotIssue } from "@/modules/copilot/server";
import type { Database } from "@/lib/supabase/database.types";
import type { Template } from "@/modules/templates";
import { toTemplate } from "@/modules/templates/server";
import type { ReportLifecycleRepository } from "../application/lifecycle";
import { OptimisticConcurrencyError } from "../application/lifecycle";
import type { Report, ReportVersion } from "../domain/report";
import type { ReportStatus } from "../domain/status";
import { toReport, toReportVersion } from "./mappers";

/**
 * Supabase-backed ReportLifecycleRepository. `updateStatus` passes both
 * `id` and `version` in the `.eq()` filter for optimistic concurrency
 * (docs/sessions.md: "reports.version is bumped on every update; use
 * `... where id = $1 and version = $2`"). The DB trigger
 * `reports_before_update` is the final authority on the transition itself;
 * this repository surfaces a conflict as OptimisticConcurrencyError so the
 * app-level gate in lifecycle.ts can give a friendly message first.
 */
export class SupabaseReportLifecycleRepository implements ReportLifecycleRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async getReport(reportId: string): Promise<Report> {
    const { data, error } = await this.client.from("reports").select("*").eq("id", reportId).single();
    if (error) throw new Error(`Failed to load report ${reportId}: ${error.message}`);
    return toReport(data);
  }

  async getTemplate(templateId: string): Promise<Pick<Template, "sections">> {
    const { data, error } = await this.client.from("templates").select("*").eq("id", templateId).single();
    if (error) throw new Error(`Failed to load template ${templateId}: ${error.message}`);
    return toTemplate(data);
  }

  async listOpenIssues(reportId: string): Promise<CopilotIssue[]> {
    const { data, error } = await this.client
      .from("copilot_issues")
      .select("*")
      .eq("report_id", reportId)
      .eq("resolved", false);
    if (error) throw new Error(`Failed to list open copilot issues for report ${reportId}: ${error.message}`);
    return (data ?? []).map(toCopilotIssue);
  }

  async listVersions(reportId: string): Promise<ReportVersion[]> {
    const { data, error } = await this.client.from("report_versions").select("*").eq("report_id", reportId);
    if (error) throw new Error(`Failed to list versions for report ${reportId}: ${error.message}`);
    return (data ?? []).map(toReportVersion);
  }

  async updateStatus(
    reportId: string,
    expectedVersion: number,
    update: { status: ReportStatus; signedBy?: string; signedAt?: string },
  ): Promise<Report> {
    const { data, error } = await this.client
      .from("reports")
      .update({
        status: update.status,
        ...(update.signedBy !== undefined ? { signed_by: update.signedBy } : {}),
        ...(update.signedAt !== undefined ? { signed_at: update.signedAt } : {}),
      })
      .eq("id", reportId)
      .eq("version", expectedVersion)
      .select("*")
      .maybeSingle();

    if (error) throw new Error(`Failed to update report ${reportId}: ${error.message}`);
    if (!data) throw new OptimisticConcurrencyError(reportId);
    return toReport(data);
  }
}
