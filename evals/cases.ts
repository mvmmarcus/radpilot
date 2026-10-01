import type { BodyPart, Modality, PatientSex } from "@/modules/studies";
import type { SectionKey, TemplateSection } from "@/modules/templates";

/**
 * Golden cases for the report-draft eval. Each case is shorthand (the
 * radiologist's input) + exam context + the template sections to generate,
 * plus the properties a correct draft must have (checked by evals/scorers.ts
 * against the resulting GeneratedReport). No case asserts exact wording: the
 * scorers check structural/semantic properties so the suite works against any
 * configured LLMProvider (mock, OpenAI, Anthropic), not just one adapter's
 * phrasing.
 */

const STANDARD_SECTIONS: Pick<TemplateSection, "key" | "label" | "required">[] = (
  [
    ["clinical_indication", "Clinical indication", true],
    ["technique", "Technique", true],
    ["comparison", "Comparison", false],
    ["findings", "Findings", true],
    ["impression", "Impression", true],
    ["recommendations", "Recommendations", false],
  ] as [SectionKey, string, boolean][]
).map(([key, label, required]) => ({ key, label, required }));

export interface GoldenCase {
  id: string;
  description: string;
  shorthand: string;
  exam: {
    modality: Modality;
    bodyPart: BodyPart;
    indication: string;
    patientSex: PatientSex;
    patientAgeYears: number;
  };
  sections: Pick<TemplateSection, "key" | "label" | "required">[];
  expect: {
    /** Required sections the draft must not leave empty. */
    requiredSections: SectionKey[];
    /** Laterality words (e.g. "right", "left") the findings/impression must preserve from the shorthand. */
    preserveLaterality?: ("left" | "right")[];
    /** Substrings expected in the impression (case-insensitive), e.g. a key anatomic term from the finding. */
    impressionShouldMention?: string[];
    /** True if a non-empty recommendation is expected (a guideline applies). */
    recommendationExpected: boolean;
    /** True if the impression should explicitly report no acute abnormality (fully negative shorthand). */
    expectNormalImpression?: boolean;
  };
}

export const GOLDEN_CASES: GoldenCase[] = [
  {
    id: "pe-critical",
    description: "Suspected PE, positive CTA: critical finding, no routine recommendation expected from shorthand alone",
    shorthand: "Filling defect right pulmonary artery c/w acute PE, no effusion",
    exam: { modality: "CT", bodyPart: "chest", indication: "Suspected pulmonary embolism.", patientSex: "F", patientAgeYears: 58 },
    sections: STANDARD_SECTIONS,
    expect: {
      requiredSections: ["clinical_indication", "technique", "findings", "impression"],
      preserveLaterality: ["right"],
      impressionShouldMention: ["pulmonary"],
      recommendationExpected: true,
    },
  },
  {
    id: "nodule-fleischner-8mm",
    description: "Incidental 8mm solid RLL nodule in a smoker: Fleischner follow-up expected",
    shorthand: "RLL 8mm solid nodule, no effusion, no consolidation",
    exam: { modality: "CT", bodyPart: "chest", indication: "Incidental right lung nodule, 30 pack-years.", patientSex: "M", patientAgeYears: 64 },
    sections: STANDARD_SECTIONS,
    expect: {
      requiredSections: ["clinical_indication", "technique", "findings", "impression"],
      preserveLaterality: ["right"],
      impressionShouldMention: ["nodule"],
      recommendationExpected: true,
    },
  },
  {
    id: "nodule-fleischner-4mm-low-risk",
    description: "Small 4mm nodule, low risk: still a nodule mention, recommendation may be minimal but present",
    shorthand: "LUL 4mm solid nodule",
    exam: { modality: "CT", bodyPart: "chest", indication: "Incidental nodule on prior chest radiograph.", patientSex: "F", patientAgeYears: 45 },
    sections: STANDARD_SECTIONS,
    expect: {
      requiredSections: ["clinical_indication", "technique", "findings", "impression"],
      preserveLaterality: ["left"],
      impressionShouldMention: ["nodule"],
      recommendationExpected: false,
    },
  },
  {
    id: "pneumothorax-left",
    description: "Post subclavian line, left apical pneumothorax",
    shorthand: "Left apical pneumothorax, line tip in good position, no effusion",
    exam: { modality: "CR", bodyPart: "chest", indication: "Status post left subclavian line, rule out pneumothorax.", patientSex: "M", patientAgeYears: 71 },
    sections: STANDARD_SECTIONS,
    expect: {
      requiredSections: ["clinical_indication", "technique", "findings", "impression"],
      preserveLaterality: ["left"],
      impressionShouldMention: ["pneumothorax"],
      recommendationExpected: false,
    },
  },
  {
    id: "normal-chest-xray",
    description: "Normal pre-op chest radiograph: fully negative shorthand",
    shorthand: "No focal consolidation, no pleural effusion or pneumothorax, normal cardiomediastinal silhouette, no acute osseous abnormality",
    exam: { modality: "CR", bodyPart: "chest", indication: "Preoperative evaluation.", patientSex: "F", patientAgeYears: 45 },
    sections: STANDARD_SECTIONS,
    expect: {
      requiredSections: ["clinical_indication", "technique", "findings", "impression"],
      recommendationExpected: false,
      expectNormalImpression: true,
    },
  },
  {
    id: "hemorrhage-right-subdural",
    description: "Fall on anticoagulation, right subdural hemorrhage: critical + laterality",
    shorthand: "Right convexity subdural hematoma, no midline shift, no herniation",
    exam: { modality: "CT", bodyPart: "head", indication: "Fall on apixaban, rule out intracranial hemorrhage.", patientSex: "M", patientAgeYears: 82 },
    sections: STANDARD_SECTIONS,
    expect: {
      requiredSections: ["clinical_indication", "technique", "findings", "impression"],
      preserveLaterality: ["right"],
      impressionShouldMention: ["subdural"],
      recommendationExpected: false,
    },
  },
  {
    id: "appendicitis-rlq",
    description: "RLQ pain, young woman: appendicitis finding, laterality must stay right",
    shorthand: "Dilated right lower quadrant appendix 9mm with surrounding fat stranding, no free air",
    exam: { modality: "CT", bodyPart: "abdomen_pelvis", indication: "Right lower quadrant pain, evaluate for appendicitis.", patientSex: "F", patientAgeYears: 27 },
    sections: STANDARD_SECTIONS,
    expect: {
      requiredSections: ["clinical_indication", "technique", "findings", "impression"],
      preserveLaterality: ["right"],
      impressionShouldMention: ["appendi"],
      recommendationExpected: false,
    },
  },
  {
    id: "ovarian-torsion-left",
    description: "Alternative diagnosis in the same patient population: left ovarian torsion, laterality check",
    shorthand: "Enlarged left ovary with absent Doppler flow c/w torsion, no free fluid",
    exam: { modality: "CT", bodyPart: "abdomen_pelvis", indication: "Right lower quadrant pain; ovarian torsion also considered.", patientSex: "F", patientAgeYears: 27 },
    sections: STANDARD_SECTIONS,
    expect: {
      requiredSections: ["clinical_indication", "technique", "findings", "impression"],
      preserveLaterality: ["left"],
      impressionShouldMention: ["ovar"],
      recommendationExpected: false,
    },
  },
  {
    id: "hcc-surveillance",
    description: "Cirrhosis, HCC surveillance: liver observation",
    shorthand: "2.1cm arterially enhancing liver lesion segment 6 with washout, no biliary dilatation",
    exam: { modality: "CT", bodyPart: "abdomen_pelvis", indication: "Cirrhosis, HCC surveillance.", patientSex: "M", patientAgeYears: 59 },
    sections: STANDARD_SECTIONS,
    expect: {
      requiredSections: ["clinical_indication", "technique", "findings", "impression"],
      impressionShouldMention: ["liver"],
      recommendationExpected: false,
    },
  },
  {
    id: "thyroid-nodule-left",
    description: "Palpable left thyroid nodule: TI-RADS context, laterality",
    shorthand: "Left thyroid lobe 1.8cm solid hypoechoic nodule with microcalcifications, no suspicious lymph nodes",
    exam: { modality: "US", bodyPart: "thyroid", indication: "Palpable left thyroid nodule.", patientSex: "F", patientAgeYears: 39 },
    sections: STANDARD_SECTIONS,
    expect: {
      requiredSections: ["clinical_indication", "technique", "findings", "impression"],
      preserveLaterality: ["left"],
      impressionShouldMention: ["nodule"],
      recommendationExpected: false,
    },
  },
  {
    id: "screening-mammogram-normal",
    description: "Screening mammogram, no findings: BI-RADS 1 territory",
    shorthand: "No dominant mass, no suspicious calcifications, no architectural distortion",
    exam: { modality: "MG", bodyPart: "breast", indication: "Routine screening.", patientSex: "F", patientAgeYears: 52 },
    sections: STANDARD_SECTIONS,
    expect: {
      requiredSections: ["clinical_indication", "technique", "findings", "impression"],
      recommendationExpected: false,
      expectNormalImpression: true,
    },
  },
  {
    id: "hematuria-mass",
    description: "Painless hematuria in a man: bladder mass, sex-consistent anatomy",
    shorthand: "3cm bladder wall mass left lateral wall, no hydronephrosis",
    exam: { modality: "CT", bodyPart: "abdomen_pelvis", indication: "Painless gross hematuria, evaluate for urinary tract malignancy.", patientSex: "M", patientAgeYears: 68 },
    sections: STANDARD_SECTIONS,
    expect: {
      requiredSections: ["clinical_indication", "technique", "findings", "impression"],
      preserveLaterality: ["left"],
      impressionShouldMention: ["bladder"],
      recommendationExpected: false,
    },
  },
  {
    id: "bilateral-nodules",
    description: "Bilateral pulmonary nodules: laterality word 'bilateral' should survive, not be dropped to one side",
    shorthand: "Bilateral 5mm solid pulmonary nodules, no effusion",
    exam: { modality: "CT", bodyPart: "chest", indication: "Incidental nodules on prior imaging.", patientSex: "F", patientAgeYears: 60 },
    sections: STANDARD_SECTIONS,
    expect: {
      requiredSections: ["clinical_indication", "technique", "findings", "impression"],
      impressionShouldMention: ["nodule"],
      recommendationExpected: false,
    },
  },
  {
    id: "aortic-dissection",
    description: "Critical finding: aortic dissection",
    shorthand: "Stanford type B aortic dissection originating distal to left subclavian artery, no pericardial effusion",
    exam: { modality: "CT", bodyPart: "chest", indication: "Acute severe chest and back pain.", patientSex: "M", patientAgeYears: 66 },
    sections: STANDARD_SECTIONS,
    expect: {
      requiredSections: ["clinical_indication", "technique", "findings", "impression"],
      preserveLaterality: ["left"],
      impressionShouldMention: ["dissection"],
      recommendationExpected: false,
    },
  },
  {
    id: "free-air-perforation",
    description: "Critical finding: free intraperitoneal air",
    shorthand: "Free intraperitoneal air anterior to the liver, no drainable fluid collection",
    exam: { modality: "CT", bodyPart: "abdomen_pelvis", indication: "Acute severe abdominal pain, rule out perforation.", patientSex: "M", patientAgeYears: 54 },
    sections: STANDARD_SECTIONS,
    expect: {
      requiredSections: ["clinical_indication", "technique", "findings", "impression"],
      impressionShouldMention: ["free", "intraperitoneal"],
      recommendationExpected: false,
    },
  },
  {
    id: "renal-cyst-benign",
    description: "Benign incidental finding, no follow-up warranted",
    shorthand: "2cm simple right renal cyst, no solid component, no septations",
    exam: { modality: "CT", bodyPart: "abdomen_pelvis", indication: "Right flank pain.", patientSex: "F", patientAgeYears: 48 },
    sections: STANDARD_SECTIONS,
    expect: {
      requiredSections: ["clinical_indication", "technique", "findings", "impression"],
      preserveLaterality: ["right"],
      impressionShouldMention: ["cyst"],
      recommendationExpected: false,
    },
  },
  {
    id: "multiple-nodules-high-risk",
    description: "Multiple nodules, larger dominant lesion: recommendation still expected via measurement+nodule heuristic",
    shorthand: "Two solid pulmonary nodules right upper lobe 9mm and right lower lobe 5mm, heavy smoking history, no cavitation",
    exam: { modality: "CT", bodyPart: "chest", indication: "Incidental nodules, 40 pack-year smoker.", patientSex: "M", patientAgeYears: 67 },
    sections: STANDARD_SECTIONS,
    expect: {
      requiredSections: ["clinical_indication", "technique", "findings", "impression"],
      preserveLaterality: ["right"],
      impressionShouldMention: ["nodule"],
      recommendationExpected: true,
    },
  },
  {
    id: "no-shorthand-empty",
    description: "Empty shorthand should still produce a safe, non-committal draft (no hallucinated findings)",
    shorthand: "",
    exam: { modality: "CT", bodyPart: "chest", indication: "Routine follow-up.", patientSex: "F", patientAgeYears: 50 },
    sections: STANDARD_SECTIONS,
    expect: {
      requiredSections: ["clinical_indication", "technique", "findings", "impression"],
      recommendationExpected: false,
      expectNormalImpression: true,
    },
  },
];
