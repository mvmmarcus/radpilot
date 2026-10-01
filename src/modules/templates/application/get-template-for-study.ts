import type { BodyPart, Modality } from "@/modules/studies";
import { selectTemplate, type Template } from "../domain/template";
import type { TemplateRepository } from "./repository";

/** The template to use for a study's exam type, or null if none matches. */
export async function getTemplateForStudy(
  repository: Pick<TemplateRepository, "listTemplates">,
  exam: { modality: Modality; bodyPart: BodyPart },
): Promise<Template | null> {
  const templates = await repository.listTemplates();
  return selectTemplate(templates, exam) ?? null;
}
