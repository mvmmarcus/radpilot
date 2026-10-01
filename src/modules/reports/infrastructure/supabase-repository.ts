import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { CreateReportInput, ReportRepository } from "../application/repository";
import { ReportVersionConflictError } from "../application/repository";
import type { ReportContent } from "../domain/content";
import type { Report } from "../domain/report";
import { toContentJson, toReport } from "./mappers";

export class SupabaseReportRepository implements ReportRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async getReport(id: string): Promise<Report | null> {
    const { data, error } = await this.client.from("reports").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(`Failed to load report ${id}: ${error.message}`);
    return data ? toReport(data) : null;
  }

  async getReportByStudy(studyId: string): Promise<Report | null> {
    const { data, error } = await this.client.from("reports").select("*").eq("study_id", studyId).maybeSingle();
    if (error) throw new Error(`Failed to load report for study ${studyId}: ${error.message}`);
    return data ? toReport(data) : null;
  }

  async createReport(input: CreateReportInput): Promise<Report> {
    const { data, error } = await this.client
      .from("reports")
      .insert({
        id: input.id,
        study_id: input.studyId,
        template_id: input.templateId,
        content: toContentJson(input.content),
        created_by: input.createdBy,
      })
      .select("*")
      .single();
    if (error) throw new Error(`Failed to create report for study ${input.studyId}: ${error.message}`);
    return toReport(data);
  }

  /** Flags the report as carrying a critical finding. Returns the updated row (new version). */
  async markCritical(id: string): Promise<Report> {
    const { data, error } = await this.client
      .from("reports")
      .update({ is_critical: true })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw new Error(`Failed to flag report ${id} as critical: ${error.message}`);
    return toReport(data);
  }

  async saveContent(id: string, expectedVersion: number, content: ReportContent): Promise<Report> {
    const { data, error } = await this.client
      .from("reports")
      .update({ content: toContentJson(content) })
      .eq("id", id)
      .eq("version", expectedVersion)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(`Failed to save report ${id}: ${error.message}`);
    if (!data) {
      // Either the version was stale, or the report does not exist. Distinguish the two.
      const current = await this.getReport(id);
      if (current) throw new ReportVersionConflictError(id);
      throw new Error(`Report ${id} not found`);
    }
    return toReport(data);
  }
}
