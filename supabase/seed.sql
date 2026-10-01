-- RadPilot demo seed. Runs on `supabase db reset` as `postgres`, so RLS is bypassed.
--
-- SYNTHETIC DATA ONLY. Every patient, study and report below is invented.
-- Not for clinical use. See docs/adr/0004-phi-policy.md.
--
-- Fixed UUIDs (valid v4 shape) keep links, tests and demo scripts stable:
--   a0000000-...  users            a1000000-...  auth identities
--   10000000-...  patients         20000000-...  studies
--   30000000-...  templates        40000000-...  reports
--
-- Times are relative to now() and ages to current_date, so the worklist always
-- looks fresh and patient ages match the demo script.
--
-- Template and report JSON is written in dollar-quoted `$json$` blocks.
-- src/lib/supabase/seed.test.ts parses them with the domain zod schemas, so
-- this file cannot drift from TemplateSchema or ReportContentSchema.

-- ---------------------------------------------------------------------------
-- Demo users (password: radpilot-demo)
-- The on_auth_user_created trigger creates each profile from full_name.
-- ---------------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values
  (
    '00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'radiologist@radpilot.test',
    extensions.crypt('radpilot-demo', extensions.gen_salt('bf')), now(),
    '{"provider": "email", "providers": ["email"]}', '{"full_name": "Dr. Alex Morgan"}',
    now(), now(), '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'admin@radpilot.test',
    extensions.crypt('radpilot-demo', extensions.gen_salt('bf')), now(),
    '{"provider": "email", "providers": ["email"]}', '{"full_name": "Dr. Sam Rivera"}',
    now(), now(), '', '', '', ''
  );

insert into auth.identities (
  id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
) values
  (
    'a1000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
    'a0000000-0000-4000-8000-000000000001', 'email',
    '{"sub": "a0000000-0000-4000-8000-000000000001", "email": "radiologist@radpilot.test", "email_verified": true, "phone_verified": false}',
    now(), now(), now()
  ),
  (
    'a1000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000002',
    'a0000000-0000-4000-8000-000000000002', 'email',
    '{"sub": "a0000000-0000-4000-8000-000000000002", "email": "admin@radpilot.test", "email_verified": true, "phone_verified": false}',
    now(), now(), now()
  );

update public.profiles set role = 'admin' where id = 'a0000000-0000-4000-8000-000000000002';

-- ---------------------------------------------------------------------------
-- Templates (one per modality + body part). JSON matches TemplateSchema.
-- ---------------------------------------------------------------------------
insert into public.templates (id, slug, name, modality, body_part, sections, macros, normal_text) values (
  '30000000-0000-4000-8000-000000000001', 'ct-chest', 'CT Chest', 'CT', 'chest',
  $json$[
    {"key": "clinical_indication", "label": "Clinical indication", "required": true, "aiAssisted": false},
    {"key": "technique", "label": "Technique", "required": true, "aiAssisted": true,
     "defaultText": "Helical CT of the chest after intravenous administration of 75 mL of iodinated contrast. Axial images reconstructed at 1.25 mm and 5 mm, with coronal and sagittal reformats."},
    {"key": "comparison", "label": "Comparison", "required": true, "aiAssisted": false, "defaultText": "None."},
    {"key": "findings", "label": "Findings", "required": true, "aiAssisted": true,
     "placeholder": "Shorthand, e.g. \"RLL 8mm solid nodule, no effusion\""},
    {"key": "impression", "label": "Impression", "required": true, "aiAssisted": true},
    {"key": "recommendations", "label": "Recommendations", "required": false, "aiAssisted": true}
  ]$json$,
  $json$[
    {"trigger": ".nopte", "label": "No pulmonary embolism", "section": "impression",
     "text": "No pulmonary embolism."},
    {"trigger": ".pe", "label": "Pulmonary embolism", "section": "findings",
     "text": "Pulmonary arteries: Filling defects in the ___ pulmonary arteries, consistent with acute pulmonary embolism. RV/LV diameter ratio ___."},
    {"trigger": ".nodule", "label": "Solid pulmonary nodule", "section": "findings",
     "text": "Lungs: Solid nodule in the ___ lobe measuring ___ mm (series ___, image ___)."}
  ]$json$,
  $json${
    "findings": "Lungs and airways: Clear lungs. No consolidation, nodule or mass. The central airways are patent.\nPleura: No pleural effusion or pneumothorax.\nHeart and pericardium: Normal heart size. No pericardial effusion.\nMediastinum and hila: No lymphadenopathy.\nVessels: Normal caliber thoracic aorta and main pulmonary artery.\nChest wall and lower neck: Unremarkable.\nUpper abdomen: Unremarkable within the limits of this exam.\nBones: No acute fracture or suspicious osseous lesion.",
    "impression": "No acute cardiopulmonary abnormality."
  }$json$
);

insert into public.templates (id, slug, name, modality, body_part, sections, macros, normal_text) values (
  '30000000-0000-4000-8000-000000000002', 'ct-head', 'CT Head', 'CT', 'head',
  $json$[
    {"key": "clinical_indication", "label": "Clinical indication", "required": true, "aiAssisted": false},
    {"key": "technique", "label": "Technique", "required": true, "aiAssisted": true,
     "defaultText": "Axial CT of the head without intravenous contrast, with coronal and sagittal reformats."},
    {"key": "comparison", "label": "Comparison", "required": true, "aiAssisted": false, "defaultText": "None."},
    {"key": "findings", "label": "Findings", "required": true, "aiAssisted": true,
     "placeholder": "Shorthand, e.g. \"R convexity SDH 8mm, 3mm MLS\""},
    {"key": "impression", "label": "Impression", "required": true, "aiAssisted": true},
    {"key": "recommendations", "label": "Recommendations", "required": false, "aiAssisted": true}
  ]$json$,
  $json$[
    {"trigger": ".noich", "label": "No intracranial hemorrhage", "section": "impression",
     "text": "No acute intracranial hemorrhage."},
    {"trigger": ".sdh", "label": "Subdural hematoma", "section": "findings",
     "text": "Extra-axial spaces: Acute subdural hematoma along the ___ cerebral convexity, measuring ___ mm in maximal thickness, with ___ mm of leftward/rightward midline shift."}
  ]$json$,
  $json${
    "findings": "Brain parenchyma: No acute territorial infarct, hemorrhage or mass. Gray-white matter differentiation is preserved.\nExtra-axial spaces: No extra-axial collection.\nVentricles: Normal size and configuration. No midline shift.\nBasal cisterns: Patent.\nCalvarium and skull base: No fracture.\nParanasal sinuses and mastoid air cells: Clear.",
    "impression": "No acute intracranial abnormality."
  }$json$
);

insert into public.templates (id, slug, name, modality, body_part, sections, macros, normal_text) values (
  '30000000-0000-4000-8000-000000000003', 'ct-abdomen-pelvis', 'CT Abdomen and Pelvis', 'CT', 'abdomen_pelvis',
  $json$[
    {"key": "clinical_indication", "label": "Clinical indication", "required": true, "aiAssisted": false},
    {"key": "technique", "label": "Technique", "required": true, "aiAssisted": true,
     "defaultText": "Helical CT of the abdomen and pelvis in the portal venous phase after intravenous administration of 100 mL of iodinated contrast. Coronal and sagittal reformats."},
    {"key": "comparison", "label": "Comparison", "required": true, "aiAssisted": false, "defaultText": "None."},
    {"key": "findings", "label": "Findings", "required": true, "aiAssisted": true,
     "placeholder": "Shorthand, e.g. \"appendix 11mm, periappendiceal stranding, no abscess\""},
    {"key": "impression", "label": "Impression", "required": true, "aiAssisted": true},
    {"key": "recommendations", "label": "Recommendations", "required": false, "aiAssisted": true}
  ]$json$,
  $json$[
    {"trigger": ".appy", "label": "Acute appendicitis", "section": "findings",
     "text": "Bowel and appendix: Dilated appendix measuring ___ mm with wall thickening and periappendiceal fat stranding, consistent with acute appendicitis. No abscess or extraluminal air."},
    {"trigger": ".lirads", "label": "LI-RADS observation", "section": "findings",
     "text": "Liver: Observation in segment ___ measuring ___ mm with nonrim arterial phase hyperenhancement, ___ washout and ___ enhancing capsule. LI-RADS ___."},
    {"trigger": ".nofree", "label": "No free air or fluid", "section": "findings",
     "text": "Peritoneum: No free air or free fluid."}
  ]$json$,
  $json${
    "findings": "Lower chest: Clear lung bases.\nLiver: Normal size and attenuation. No focal lesion.\nGallbladder and bile ducts: Normal gallbladder. No biliary dilatation.\nPancreas: Normal.\nSpleen: Normal size.\nAdrenal glands: Normal.\nKidneys and ureters: Symmetric enhancement. No hydronephrosis or calculi.\nBladder: Unremarkable.\nPelvic organs: Unremarkable.\nBowel and appendix: Normal caliber bowel. Normal appendix.\nPeritoneum: No free air or free fluid.\nLymph nodes: No lymphadenopathy.\nVessels: Normal caliber abdominal aorta.\nBones and soft tissues: No acute or suspicious osseous lesion.",
    "impression": "No acute abnormality in the abdomen or pelvis."
  }$json$
);

insert into public.templates (id, slug, name, modality, body_part, sections, macros, normal_text) values (
  '30000000-0000-4000-8000-000000000004', 'cr-chest', 'Chest Radiograph', 'CR', 'chest',
  $json$[
    {"key": "clinical_indication", "label": "Clinical indication", "required": true, "aiAssisted": false},
    {"key": "technique", "label": "Technique", "required": true, "aiAssisted": true,
     "defaultText": "PA and lateral views of the chest."},
    {"key": "comparison", "label": "Comparison", "required": true, "aiAssisted": false, "defaultText": "None."},
    {"key": "findings", "label": "Findings", "required": true, "aiAssisted": true,
     "placeholder": "Shorthand, e.g. \"L apical PTX 2cm, line tip SVC\""},
    {"key": "impression", "label": "Impression", "required": true, "aiAssisted": true},
    {"key": "recommendations", "label": "Recommendations", "required": false, "aiAssisted": true}
  ]$json$,
  $json$[
    {"trigger": ".noptx", "label": "No pneumothorax", "section": "impression",
     "text": "No pneumothorax."},
    {"trigger": ".ptx", "label": "Pneumothorax", "section": "findings",
     "text": "Pleura: ___ apical pneumothorax with the visceral pleural line ___ cm from the chest wall."},
    {"trigger": ".line", "label": "Central venous catheter", "section": "findings",
     "text": "Lines and tubes: ___ subclavian central venous catheter with the tip projecting over the ___."}
  ]$json$,
  $json${
    "findings": "Lines and tubes: None.\nLungs: Clear. No focal consolidation.\nPleura: No pleural effusion or pneumothorax.\nHeart and mediastinum: Normal cardiomediastinal silhouette.\nBones: No acute osseous abnormality.",
    "impression": "No acute cardiopulmonary abnormality."
  }$json$
);

insert into public.templates (id, slug, name, modality, body_part, sections, macros, normal_text) values (
  '30000000-0000-4000-8000-000000000005', 'us-thyroid', 'US Thyroid', 'US', 'thyroid',
  $json$[
    {"key": "clinical_indication", "label": "Clinical indication", "required": true, "aiAssisted": false},
    {"key": "technique", "label": "Technique", "required": true, "aiAssisted": true,
     "defaultText": "Grayscale and color Doppler ultrasound of the thyroid gland and central neck."},
    {"key": "comparison", "label": "Comparison", "required": true, "aiAssisted": false, "defaultText": "None."},
    {"key": "findings", "label": "Findings", "required": true, "aiAssisted": true,
     "placeholder": "Shorthand, e.g. \"L lobe 1.8cm solid hypoechoic nodule, taller than wide\""},
    {"key": "impression", "label": "Impression", "required": true, "aiAssisted": true},
    {"key": "recommendations", "label": "Recommendations", "required": false, "aiAssisted": true}
  ]$json$,
  $json$[
    {"trigger": ".tirads", "label": "ACR TI-RADS nodule", "section": "findings",
     "text": "Nodule in the ___ lobe measuring ___ x ___ x ___ cm. Composition: ___. Echogenicity: ___. Shape: ___. Margin: ___. Echogenic foci: ___. ACR TI-RADS ___ points (TR___)."},
    {"trigger": ".nonodes", "label": "No abnormal lymph nodes", "section": "findings",
     "text": "Cervical lymph nodes: No abnormal lymph nodes."}
  ]$json$,
  $json${
    "findings": "Right lobe: Normal size with homogeneous echotexture. No nodule.\nLeft lobe: Normal size with homogeneous echotexture. No nodule.\nIsthmus: Normal thickness. No nodule.\nCervical lymph nodes: No abnormal lymph nodes.",
    "impression": "Normal thyroid ultrasound."
  }$json$
);

insert into public.templates (id, slug, name, modality, body_part, sections, macros, normal_text) values (
  '30000000-0000-4000-8000-000000000006', 'mg-breast', 'Mammography', 'MG', 'breast',
  $json$[
    {"key": "clinical_indication", "label": "Clinical indication", "required": true, "aiAssisted": false},
    {"key": "technique", "label": "Technique", "required": true, "aiAssisted": true,
     "defaultText": "Bilateral full-field digital mammography with craniocaudal and mediolateral oblique views."},
    {"key": "comparison", "label": "Comparison", "required": true, "aiAssisted": false, "defaultText": "None."},
    {"key": "findings", "label": "Findings", "required": true, "aiAssisted": true,
     "placeholder": "Shorthand, e.g. \"scattered density, no suspicious findings\""},
    {"key": "impression", "label": "Impression", "required": true, "aiAssisted": true},
    {"key": "recommendations", "label": "Recommendations", "required": true, "aiAssisted": true}
  ]$json$,
  $json$[
    {"trigger": ".birads2", "label": "BI-RADS 2: Benign", "section": "impression",
     "text": "BI-RADS 2: Benign."},
    {"trigger": ".birads0", "label": "BI-RADS 0: Incomplete", "section": "impression",
     "text": "BI-RADS 0: Incomplete. Additional imaging evaluation is needed."},
    {"trigger": ".callback", "label": "Diagnostic workup", "section": "recommendations",
     "text": "Diagnostic mammography and ultrasound of the ___ breast."}
  ]$json$,
  $json${
    "findings": "Breast composition: Scattered areas of fibroglandular density (ACR category B).\nRight breast: No suspicious mass, calcifications or architectural distortion.\nLeft breast: No suspicious mass, calcifications or architectural distortion.",
    "impression": "BI-RADS 1: Negative.",
    "recommendations": "Routine screening mammography in 1 year."
  }$json$
);

-- ---------------------------------------------------------------------------
-- Synthetic patients. Ages are kept constant relative to current_date.
-- ---------------------------------------------------------------------------
insert into public.patients (id, mrn, full_name, sex, birth_date) values
  ('10000000-0000-4000-8000-000000000001', 'RP-100001', 'Helen Carter',     'F', (current_date - interval '58 years 4 months')::date),
  ('10000000-0000-4000-8000-000000000002', 'RP-100002', 'Robert Hayes',     'M', (current_date - interval '64 years 7 months')::date),
  ('10000000-0000-4000-8000-000000000003', 'RP-100003', 'Walter Brooks',    'M', (current_date - interval '71 years 2 months')::date),
  ('10000000-0000-4000-8000-000000000004', 'RP-100004', 'Laura Mitchell',   'F', (current_date - interval '45 years 9 months')::date),
  ('10000000-0000-4000-8000-000000000005', 'RP-100005', 'George Patterson', 'M', (current_date - interval '82 years 1 month')::date),
  ('10000000-0000-4000-8000-000000000006', 'RP-100006', 'Sofia Ramirez',    'F', (current_date - interval '27 years 5 months')::date),
  ('10000000-0000-4000-8000-000000000007', 'RP-100007', 'Daniel Okafor',    'M', (current_date - interval '59 years 3 months')::date),
  ('10000000-0000-4000-8000-000000000008', 'RP-100008', 'Priya Nair',       'F', (current_date - interval '39 years 8 months')::date),
  ('10000000-0000-4000-8000-000000000009', 'RP-100009', 'Anne Lindqvist',   'F', (current_date - interval '52 years 6 months')::date),
  ('10000000-0000-4000-8000-000000000010', 'RP-100010', 'Thomas Becker',    'M', (current_date - interval '68 years 2 months')::date);

-- ---------------------------------------------------------------------------
-- Studies. Each one is built to demo a feature (see the comment per row).
-- ---------------------------------------------------------------------------
insert into public.studies (
  id, accession, patient_id, modality, body_part, description, indication, priority,
  study_date, dicom_path, assigned_to
) values
  -- 1. Critical finding (PE) on the CT chest phantom.
  ('20000000-0000-4000-8000-000000000001', 'RP26000001', '10000000-0000-4000-8000-000000000001',
   'CT', 'chest', 'CTA chest, pulmonary embolism protocol',
   'Acute pleuritic chest pain and dyspnea, tachycardia, elevated D-dimer. Suspected pulmonary embolism.',
   'stat', now() - interval '25 minutes', 'ct-chest-phantom', null),
  -- 2. Incidental nodule in a high-risk smoker: Fleischner recommendation.
  ('20000000-0000-4000-8000-000000000002', 'RP26000002', '10000000-0000-4000-8000-000000000002',
   'CT', 'chest', 'CT chest with contrast',
   'Incidental right lung nodule on outside chest radiograph. Former smoker, 30 pack-years.',
   'routine', now() - interval '5 hours', 'ct-chest-phantom', 'a0000000-0000-4000-8000-000000000001'),
  -- 3. Pneumothorax after a left subclavian line: critical finding + laterality.
  ('20000000-0000-4000-8000-000000000003', 'RP26000003', '10000000-0000-4000-8000-000000000003',
   'CR', 'chest', 'XR chest, 1 view (portable)',
   'Status post left subclavian central venous catheter placement. Rule out pneumothorax.',
   'stat', now() - interval '12 minutes', 'cr-chest-pneumothorax', null),
  -- 4. Already signed normal report: FHIR and PDF export demo.
  ('20000000-0000-4000-8000-000000000004', 'RP26000004', '10000000-0000-4000-8000-000000000004',
   'CR', 'chest', 'XR chest, PA and lateral',
   'Preoperative evaluation before elective laparoscopic cholecystectomy.',
   'routine', now() - interval '1 day 2 hours', 'cr-chest-normal', 'a0000000-0000-4000-8000-000000000001'),
  -- 5. Intracranial hemorrhage on anticoagulation: critical finding + laterality.
  ('20000000-0000-4000-8000-000000000005', 'RP26000005', '10000000-0000-4000-8000-000000000005',
   'CT', 'head', 'CT head without contrast',
   'Fall from standing on apixaban, now confused. Rule out intracranial hemorrhage.',
   'stat', now() - interval '8 minutes', 'ct-head-phantom', null),
  -- 6. Right lower quadrant pain in a young woman: laterality + sex checks.
  ('20000000-0000-4000-8000-000000000006', 'RP26000006', '10000000-0000-4000-8000-000000000006',
   'CT', 'abdomen_pelvis', 'CT abdomen and pelvis with contrast',
   'Right lower quadrant pain and fever for 2 days. Evaluate for appendicitis; right ovarian torsion also considered.',
   'urgent', now() - interval '50 minutes', null, null),
  -- 7. Cirrhosis, HCC surveillance: LI-RADS.
  ('20000000-0000-4000-8000-000000000007', 'RP26000007', '10000000-0000-4000-8000-000000000007',
   'CT', 'abdomen_pelvis', 'CT abdomen and pelvis, multiphase liver protocol',
   'Cirrhosis secondary to hepatitis C. HCC surveillance; 2 cm liver observation on recent ultrasound.',
   'routine', now() - interval '7 hours', null, 'a0000000-0000-4000-8000-000000000002'),
  -- 8. Palpable left thyroid nodule: TI-RADS + laterality.
  ('20000000-0000-4000-8000-000000000008', 'RP26000008', '10000000-0000-4000-8000-000000000008',
   'US', 'thyroid', 'US thyroid',
   'Palpable left thyroid nodule.',
   'routine', now() - interval '3 hours', null, null),
  -- 9. Screening mammogram: BI-RADS.
  ('20000000-0000-4000-8000-000000000009', 'RP26000009', '10000000-0000-4000-8000-000000000009',
   'MG', 'breast', 'Screening mammogram, bilateral, digital',
   'Routine screening. No breast symptoms.',
   'routine', now() - interval '2 hours', null, null),
  -- 10. Hematuria in a man: sex-mismatch demo (e.g. a report that mentions the uterus).
  ('20000000-0000-4000-8000-000000000010', 'RP26000010', '10000000-0000-4000-8000-000000000010',
   'CT', 'abdomen_pelvis', 'CT abdomen and pelvis with contrast',
   'Painless gross hematuria. Evaluate for urinary tract malignancy.',
   'urgent', now() - interval '90 minutes', null, null);

-- ---------------------------------------------------------------------------
-- Report for study 4: inserted already signed (status final). The triggers
-- write the report_versions snapshot, the report.created audit event and set
-- the study status to 'final'.
-- ---------------------------------------------------------------------------
insert into public.reports (
  id, study_id, template_id, status, content, is_critical, created_by, signed_by, signed_at,
  created_at
) values (
  '40000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000004',
  '30000000-0000-4000-8000-000000000004', 'final',
  $json${
    "schemaVersion": 1,
    "sections": {
      "clinical_indication": {"text": "Preoperative evaluation before elective laparoscopic cholecystectomy.", "source": "template", "ai": null},
      "technique": {"text": "PA and lateral views of the chest.", "source": "template", "ai": null},
      "comparison": {"text": "None.", "source": "template", "ai": null},
      "findings": {"text": "Lines and tubes: None.\nLungs: Clear. No focal consolidation.\nPleura: No pleural effusion or pneumothorax.\nHeart and mediastinum: Normal cardiomediastinal silhouette.\nBones: No acute osseous abnormality.", "source": "template", "ai": null},
      "impression": {"text": "No acute cardiopulmonary abnormality.", "source": "template", "ai": null},
      "recommendations": {"text": "", "source": "human", "ai": null}
    }
  }$json$,
  false,
  'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
  now() - interval '20 hours', now() - interval '21 hours'
);

-- The insert trigger logs report.created. Add the signing event too, so the
-- audit trail of the demo report reads like one that was signed in the app.
insert into public.audit_events (actor_id, entity, entity_id, action, payload)
select r.signed_by, 'report', r.id, 'report.signed',
       jsonb_build_object('from', 'draft', 'to', 'final', 'version', r.version, 'study_id', r.study_id)
from public.reports r
where r.id = '40000000-0000-4000-8000-000000000004';
