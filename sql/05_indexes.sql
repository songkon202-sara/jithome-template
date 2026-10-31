-- ═══════════════════════════════════════════════════════════════════
-- JitHome — เพิ่ม index ให้คอลัมน์ที่ค้นหาบ่อย (ประสิทธิภาพ P1)
-- ไม่เปลี่ยนข้อมูลหรือสิทธิ์ใดๆ · รันซ้ำได้ · ใช้เวลาไม่กี่วินาที (ตารางขนาดเล็ก)
-- สร้างเฉพาะ index ที่ตารางและคอลัมน์มีอยู่จริง (ฐานข้อมูลจริงอาจต่างจาก repo)
-- ย้อนกลับ: DROP INDEX public.<ชื่อ> — ไม่กระทบข้อมูล
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  spec TEXT[];
  cols TEXT[];
  ok   BOOLEAN;
  specs TEXT[][] := ARRAY[
    -- ชื่อ index,                    ตาราง,                 คอลัมน์ (คั่นด้วย ,),        นิยาม
    ARRAY['jh_ix_inj_patient_date',   'injection_records',   'patient_id,injection_date', '(patient_id, injection_date DESC)'],
    ARRAY['jh_ix_inj_date',           'injection_records',   'injection_date',            '(injection_date)'],
    ARRAY['jh_ix_visit_village_date', 'home_visits',         'village,visit_date',        '(village, visit_date DESC)'],
    ARRAY['jh_ix_visit_patient',      'home_visits',         'patient_id',                '(patient_id)'],
    ARRAY['jh_ix_visit_date',         'home_visits',         'visit_date',                '(visit_date DESC)'],
    ARRAY['jh_ix_appt_patient',       'doctor_appointments', 'patient_id',                '(patient_id)'],
    ARRAY['jh_ix_appt_date',          'doctor_appointments', 'appoint_date',              '(appoint_date)'],
    ARRAY['jh_ix_patients_village',   'patients',            'village',                   '(village)'],
    ARRAY['jh_ix_audit_created',      'audit_logs',          'created_at',                '(created_at DESC)']
  ];
BEGIN
  FOREACH spec SLICE 1 IN ARRAY specs LOOP
    cols := string_to_array(spec[3], ',');
    SELECT count(*) = array_length(cols, 1) INTO ok
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = spec[2] AND column_name = ANY (cols);
    IF ok THEN
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I %s', spec[1], spec[2], spec[4]);
      RAISE NOTICE '✓ %', spec[1];
    ELSE
      RAISE NOTICE '– ข้าม % (ไม่มีตาราง/คอลัมน์ %.%)', spec[1], spec[2], spec[3];
    END IF;
  END LOOP;
END $$;

SELECT indexname, tablename FROM pg_indexes
WHERE schemaname = 'public' AND indexname LIKE 'jh_ix_%' ORDER BY tablename, indexname;
