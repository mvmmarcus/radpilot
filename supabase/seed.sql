-- RadPilot demo seed. Runs on `supabase db reset` as `postgres`, so RLS is bypassed.
--
-- SYNTHETIC DATA ONLY. Every patient, study and report below is invented.
-- Not for clinical use. See docs/adr/0004-phi-policy.md.
--
-- Fixed UUIDs (valid v4 shape) keep links, tests and demo scripts stable:
--   a0000000-...  users            a1000000-...  auth identities
--   30000000-...  templates
--
-- This file creates the users and templates. Patients, studies and reports
-- come from public.seed_demo_data() (supabase/migrations/20261002000000_demo_data.sql),
-- called at the end, so the same data can be restored later by reset_demo_data().
--
-- Template JSON is written in dollar-quoted `$json$` blocks.
-- src/lib/supabase/seed.test.ts parses them with the domain zod schemas, so
-- this file cannot drift from TemplateSchema.

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
-- Patients, studies and reports (the restorable demo set).
-- ---------------------------------------------------------------------------
select public.seed_demo_data();
