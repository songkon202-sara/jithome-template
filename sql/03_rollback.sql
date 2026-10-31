-- ═══════════════════════════════════════════════════════════════════
-- JitHome Security — ย้อนกลับขั้นที่ 2 (ใช้เมื่อเปิด RLS แล้วแอปใช้งานไม่ได้)
-- คืน policy / สิทธิ์ / สถานะ RLS ให้เหมือนก่อนรัน 02_lockdown.sql
-- โดยใช้ข้อมูลสำรองชุดล่าสุดในตาราง jh_security_backup
--
-- ⚠️ หลังย้อนกลับ ข้อมูลจะกลับไปเปิดให้ anon เข้าถึงได้เหมือนเดิม
--    ให้แก้ปัญหาแล้วรัน 02_lockdown.sql ใหม่โดยเร็ว
-- (ไม่ย้อน 01_prepare.sql — ส่วนนั้นไม่กระทบการใช้งาน)
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

DO $$
DECLARE
  b TIMESTAMPTZ;
  r RECORD;
  t TEXT;
BEGIN
  SELECT max(batch) INTO b FROM public.jh_security_backup;
  IF b IS NULL THEN
    RAISE EXCEPTION 'ไม่พบข้อมูลสำรอง — ยังไม่เคยรัน 02_lockdown.sql';
  END IF;

  FOREACH t IN ARRAY ARRAY['patients','injection_records','home_visits','doctor_appointments',
                           'app_settings','user_profiles','audit_logs','login_lockouts',
                           'aosomo_directory','staff_directory','notification_settings'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, t);
    END LOOP;
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['patient_status','monthly_trend'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    END IF;
  END LOOP;

  FOR r IN SELECT stmt FROM public.jh_security_backup WHERE batch = b ORDER BY seq LOOP
    EXECUTE r.stmt;
  END LOOP;
  RAISE NOTICE 'ย้อนกลับเป็นสถานะ ณ %', b;
END $$;

COMMIT;
