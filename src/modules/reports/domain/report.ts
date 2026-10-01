import { z } from "zod";
import { ReportContentSchema } from "./content";
import { ReportStatusSchema } from "./status";

export const ReportSchema = z.object({
  id: z.uuid(),
  studyId: z.uuid(),
  templateId: z.uuid(),
  status: ReportStatusSchema,
  content: ReportContentSchema,
  /** Set by the copilot critical-finding rule or by the radiologist. */
  isCritical: z.boolean(),
  /** Incremented on every save. Used for optimistic concurrency and report_versions. */
  version: z.number().int().positive(),
  createdBy: z.uuid().nullable(),
  signedBy: z.uuid().nullable(),
  signedAt: z.iso.datetime({ offset: true }).nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});
export type Report = z.infer<typeof ReportSchema>;

/** Immutable snapshot written on every status transition. */
export const ReportVersionSchema = z.object({
  id: z.uuid(),
  reportId: z.uuid(),
  version: z.number().int().positive(),
  status: ReportStatusSchema,
  content: ReportContentSchema,
  createdBy: z.uuid().nullable(),
  createdAt: z.iso.datetime({ offset: true }),
});
export type ReportVersion = z.infer<typeof ReportVersionSchema>;
