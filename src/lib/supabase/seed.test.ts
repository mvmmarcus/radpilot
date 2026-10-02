/**
 * Guards the seed against drift from the domain: the template JSON in
 * supabase/seed.sql and the report JSON in the demo-data migration must parse
 * with TemplateSchema and ReportContentSchema, and the demo studies must keep
 * the shape the demo script relies on.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { missingRequiredSections, pendingAiSections, ReportContentSchema } from "@/modules/reports";
import { BodyPartSchema, ModalitySchema, PatientSexSchema, StudyPrioritySchema } from "@/modules/studies";
import { selectTemplate, TemplateSchema, type Template } from "@/modules/templates";
import { SERIES_NAMES } from "../../../scripts/dicom/phantoms";

// Users and templates live in seed.sql; patients, studies and reports in the
// seed_demo_data() function, which seed.sql calls and reset_demo_data() re-runs.
const read = (path: string) => readFileSync(fileURLToPath(new URL(`../../../supabase/${path}`, import.meta.url)), "utf8");
const seed = `${read("seed.sql")}\n${read("migrations/20261002000000_demo_data.sql")}`;

// --- A small reader for the seed's `insert into ... values (...)` statements ----

type Row = Record<string, string>;

/** Unquote '...' (with '' escapes, optional ::cast) and $tag$...$tag$ literals; keep expressions raw. */
function literal(raw: string): string {
  const quoted = /^'((?:[^']|'')*)'(?:::[\w.]+)?$/s.exec(raw);
  if (quoted) return quoted[1].replaceAll("''", "'");
  const dollar = /^\$(\w*)\$([\s\S]*)\$\1\$(?:::[\w.]+)?$/.exec(raw);
  if (dollar) return dollar[2];
  return raw;
}

/** Tuples of raw values after `values`, up to the terminating semicolon. */
function readTuples(sql: string, start: number): string[][] {
  const tuples: string[][] = [];
  let depth = 0;
  let value = "";
  let values: string[] = [];
  for (let i = start; i < sql.length; i++) {
    const ch = sql[i];
    if (ch === "-" && sql[i + 1] === "-") {
      i = sql.indexOf("\n", i); // comment to end of line
      if (i === -1) break;
      continue;
    }
    if (ch === "'") {
      let j = i + 1;
      while (j < sql.length && !(sql[j] === "'" && sql[j + 1] !== "'")) j += sql[j] === "'" ? 2 : 1;
      value += sql.slice(i, j + 1);
      i = j;
      continue;
    }
    const tag = ch === "$" ? /^\$\w*\$/.exec(sql.slice(i)) : null;
    if (tag) {
      const end = sql.indexOf(tag[0], i + tag[0].length);
      value += sql.slice(i, end + tag[0].length);
      i = end + tag[0].length - 1;
      continue;
    }
    if (ch === "(") {
      depth++;
      if (depth === 1) continue;
    } else if (ch === ")") {
      depth--;
      if (depth === 0) {
        values.push(value.trim());
        tuples.push(values);
        values = [];
        value = "";
        continue;
      }
    } else if (ch === "," && depth === 1) {
      values.push(value.trim());
      value = "";
      continue;
    } else if (ch === ";" && depth === 0) {
      break;
    }
    if (depth >= 1) value += ch;
  }
  return tuples;
}

function insertsInto(table: string): Row[] {
  const header = new RegExp(`insert into ${table.replace(".", "\\.")}\\s*\\(([^)]*)\\)\\s*values`, "gi");
  return [...seed.matchAll(header)].flatMap((match) => {
    const columns = match[1].split(",").map((c) => c.trim());
    return readTuples(seed, match.index + match[0].length).map((values) => {
      if (values.length !== columns.length) {
        throw new Error(`${table}: ${values.length} values for ${columns.length} columns`);
      }
      return Object.fromEntries(columns.map((column, i) => [column, literal(values[i])]));
    });
  });
}

const USERS = {
  radiologist: "a0000000-0000-4000-8000-000000000001",
  admin: "a0000000-0000-4000-8000-000000000002",
};

const templates: Template[] = insertsInto("public.templates").map((row) =>
  TemplateSchema.parse({
    id: row.id,
    slug: row.slug,
    name: row.name,
    modality: row.modality,
    bodyPart: row.body_part,
    sections: JSON.parse(row.sections),
    macros: JSON.parse(row.macros),
    normalText: JSON.parse(row.normal_text),
  }),
);
const patients = insertsInto("public.patients");
const studies = insertsInto("public.studies");
const reports = insertsInto("public.reports");

// --- Tests -----------------------------------------------------------------------

describe("seed.sql: users", () => {
  it("creates the two demo users with identities and the shared demo password", () => {
    const users = insertsInto("auth.users");
    expect(users.map((u) => [u.id, u.email])).toEqual([
      [USERS.radiologist, "radiologist@radpilot.test"],
      [USERS.admin, "admin@radpilot.test"],
    ]);
    expect(users.map((u) => JSON.parse(u.raw_user_meta_data).full_name)).toEqual(["Dr. Alex Morgan", "Dr. Sam Rivera"]);
    for (const user of users) expect(user.encrypted_password).toContain("crypt('radpilot-demo'");
    expect(insertsInto("auth.identities").map((i) => i.user_id)).toEqual([USERS.radiologist, USERS.admin]);
    expect(seed).toMatch(/update public\.profiles set role = 'admin' where id = 'a0000000-0000-4000-8000-000000000002'/);
  });
});

describe("seed.sql: templates", () => {
  it("has the six templates, each valid against TemplateSchema", () => {
    expect(templates.map((t) => t.slug)).toEqual([
      "ct-chest",
      "ct-head",
      "ct-abdomen-pelvis",
      "cr-chest",
      "us-thyroid",
      "mg-breast",
    ]);
    const exams = templates.map((t) => `${t.modality}/${t.bodyPart}`);
    expect(new Set(exams).size).toBe(exams.length);
  });

  it.each(["ct-chest", "ct-head", "ct-abdomen-pelvis", "cr-chest", "us-thyroid", "mg-breast"])(
    "%s has technique and comparison defaults, normal text and 1-3 macros",
    (slug) => {
      const template = templates.find((t) => t.slug === slug)!;
      const section = (key: string) => template.sections.find((s) => s.key === key);
      expect(section("technique")?.defaultText?.length).toBeGreaterThan(10);
      expect(section("comparison")?.defaultText).toBe("None.");
      expect(template.normalText.findings?.length).toBeGreaterThan(20);
      expect(template.normalText.impression?.length).toBeGreaterThan(5);
      expect(template.macros.length).toBeGreaterThanOrEqual(1);
      expect(template.macros.length).toBeLessThanOrEqual(3);
    },
  );

  it("gives mammography a BI-RADS 1 normal impression with a recommendation", () => {
    const mg = templates.find((t) => t.slug === "mg-breast")!;
    expect(mg.normalText.impression).toBe("BI-RADS 1: Negative.");
    expect(mg.normalText.recommendations).toMatch(/screening mammography/i);
  });
});

describe("seed.sql: patients and studies", () => {
  // [modality, body part, priority, sex, age] in the order of the demo script.
  const expected = [
    ["CT", "chest", "stat", "F", 58],
    ["CT", "chest", "routine", "M", 64],
    ["CR", "chest", "stat", "M", 71],
    ["CR", "chest", "routine", "F", 45],
    ["CT", "head", "stat", "M", 82],
    ["CT", "abdomen_pelvis", "urgent", "F", 27],
    ["CT", "abdomen_pelvis", "routine", "M", 59],
    ["US", "thyroid", "routine", "F", 39],
    ["MG", "breast", "routine", "F", 52],
    ["CT", "abdomen_pelvis", "urgent", "M", 68],
  ] as const;

  it("keeps the ten demo-script studies first, each with a patient and a matching template", () => {
    expected.forEach(([modality, bodyPart, priority, sex, age], i) => {
      const study = studies[i];
      const n = String(i + 1).padStart(2, "0");
      expect(study.id).toBe(`20000000-0000-4000-8000-0000000000${n}`);
      expect(ModalitySchema.parse(study.modality)).toBe(modality);
      expect(BodyPartSchema.parse(study.body_part)).toBe(bodyPart);
      expect(StudyPrioritySchema.parse(study.priority)).toBe(priority);

      const patient = patients.find((p) => p.id === study.patient_id)!;
      expect(PatientSexSchema.parse(patient.sex)).toBe(sex);
      expect(patient.birth_date).toContain(`interval '${age} years`);
    });
  });

  it("has 25 studies with sequential ids, each with its own patient, a template and a relative time", () => {
    expect(studies).toHaveLength(25);
    expect(patients).toHaveLength(25);
    studies.forEach((study, i) => {
      const n = String(i + 1).padStart(2, "0");
      expect(study.id).toBe(`20000000-0000-4000-8000-0000000000${n}`);
      expect(study.accession).toBe(`RP260000${n}`);
      expect(study.patient_id).toBe(`10000000-0000-4000-8000-0000000000${n}`);
      expect(patients.some((p) => p.id === study.patient_id)).toBe(true);
      expect(study.study_date).toMatch(/^now\(\) - interval '/);
      StudyPrioritySchema.parse(study.priority);
      const exam = { modality: ModalitySchema.parse(study.modality), bodyPart: BodyPartSchema.parse(study.body_part) };
      expect(selectTemplate(templates, exam)).toBeDefined();
    });
  });

  it("points imaging studies at phantom series that dicom:generate writes", () => {
    const paths = studies.map((s) => s.dicom_path).filter((p) => p !== "null");
    expect(paths.slice(0, 5)).toEqual([
      "ct-chest-phantom",
      "ct-chest-phantom",
      "cr-chest-pneumothorax",
      "cr-chest-normal",
      "ct-head-phantom",
    ]);
    for (const path of paths) expect(SERIES_NAMES).toContain(path);
  });
});

describe("seed: reports", () => {
  const byStudy = (n: number) => reports.find((r) => r.study_id.endsWith(String(n).padStart(2, "0")))!;
  const parsed = (report: Row) => ({
    content: ReportContentSchema.parse(JSON.parse(report.content)),
    template: templates.find((t) => t.id === report.template_id)!,
  });

  it("gives every report valid content, its study's template and a seeded author", () => {
    expect(reports).toHaveLength(11);
    for (const report of reports) {
      const study = studies.find((s) => s.id === report.study_id)!;
      const { template } = parsed(report);
      expect(`${template.modality}/${template.bodyPart}`).toBe(`${study.modality}/${study.body_part}`);
      expect(Object.values(USERS)).toContain(report.created_by);
    }
  });

  it("covers every report state a visitor can pick up from", () => {
    const count = (status: string) => reports.filter((r) => r.status === status).length;
    expect({ draft: count("draft"), preliminary: count("preliminary"), final: count("final") }).toEqual({
      draft: 3,
      preliminary: 2,
      final: 6,
    });
    // Study 15 is inserted final and re-opened by an update, so the amend is in its history.
    expect(seed).toMatch(/update public\.reports set status = 'amended' where id = '40000000-0000-4000-8000-000000000015'/);
  });

  it("seeds signed and preliminary reports complete, with no AI text pending", () => {
    for (const report of reports.filter((r) => r.status !== "draft")) {
      const { content, template } = parsed(report);
      expect(missingRequiredSections(content, template)).toEqual([]);
      expect(pendingAiSections(content)).toEqual([]);
    }
    for (const report of reports.filter((r) => r.status === "final")) {
      expect(Object.values(USERS)).toContain(report.signed_by);
      expect(report.signed_at).toMatch(/^now\(\)/);
    }
  });

  it("seeds the drafts that demo the sign gate", () => {
    expect(pendingAiSections(parsed(byStudy(11)).content)).toEqual(["findings", "impression"]);
    expect(parsed(byStudy(12)).content.sections.findings?.text).toMatch(/pneumothorax/i);
    const conflict = parsed(byStudy(22)).content.sections;
    expect(conflict.findings?.text).toMatch(/left distal ureter/);
    expect(conflict.impression?.text).toMatch(/right distal ureteral/);
    expect(byStudy(14).is_critical).toBe("true");
  });
});

describe("seed.sql: the signed report for study 4", () => {
  it("is inserted final, signed by the radiologist, with valid ReportContent", () => {
    const report = reports.find((r) => r.study_id === "20000000-0000-4000-8000-000000000004")!;
    expect(report.study_id).toBe("20000000-0000-4000-8000-000000000004");
    expect(report.status).toBe("final");
    expect(report.signed_by).toBe(USERS.radiologist);
    expect(report.created_by).toBe(USERS.radiologist);
    expect(report.signed_at).toMatch(/^now\(\)/);

    const content = ReportContentSchema.parse(JSON.parse(report.content));
    const template = templates.find((t) => t.id === report.template_id)!;
    expect(template.slug).toBe("cr-chest");
    expect(missingRequiredSections(content, template)).toEqual([]);
    expect(pendingAiSections(content)).toEqual([]);
    expect(content.sections.impression?.text).toBe(template.normalText.impression);
  });
});
