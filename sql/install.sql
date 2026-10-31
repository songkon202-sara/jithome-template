-- ═══════════════════════════════════════════════════════════════════
-- JitHome — ติดตั้งฐานข้อมูลครบในครั้งเดียว (สำหรับ Supabase project ใหม่)
--
-- วิธีใช้: Supabase → SQL Editor → New query → วางไฟล์นี้ทั้งหมด → Run
--   ถ้ามีหน้าต่าง "Potential issue detected" ให้กด "Run without RLS"
--   (สคริปต์เปิด RLS ให้เองครบทุกตาราง)
-- ผลที่ควรเห็นท้ายสุด: ติดตั้งเสร็จ
--
-- รันซ้ำได้ (ไม่ลบข้อมูลเดิม)
-- ═══════════════════════════════════════════════════════════════════

-- ─── 0. ส่วนขยาย ──────────────────────────────────────────────────
-- pg_net: ส่ง Telegram จากฐานข้อมูล · pg_cron: ตั้งเวลารายงานทุกเช้า
DO $$
BEGIN
  BEGIN CREATE EXTENSION IF NOT EXISTS pg_net;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'เปิด pg_net ไม่ได้: % — เปิดเองที่ Database → Extensions', SQLERRM; END;
  BEGIN CREATE EXTENSION IF NOT EXISTS pg_cron;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'เปิด pg_cron ไม่ได้: % — เปิดเองที่ Database → Extensions', SQLERRM; END;
END $$;

-- ─── 1. ตาราง ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.patients (
  id bigserial PRIMARY KEY,
  name text NOT NULL UNIQUE,
  village text DEFAULT '' NOT NULL,
  note text DEFAULT '' NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  file_url text DEFAULT '' NOT NULL,
  staff_responsible text DEFAULT '' NOT NULL,
  aosomo_responsible text DEFAULT '' NOT NULL,
  national_id text DEFAULT '' NOT NULL,
  disease_code text,
  disease_name text,
  visit_interval integer,
  inject_interval integer,
  medication_name text,
  house_no text DEFAULT '',
  consent_given boolean DEFAULT false,
  consent_date date,
  photo_url text,
  oral_medication text,
  photo_urls text[] DEFAULT '{}',
  next_visit_date date,
  next_inject_date date,
  consent_signature text
);

CREATE TABLE IF NOT EXISTS public.injection_records (
  id bigserial PRIMARY KEY,
  patient_id bigint NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  injection_date date NOT NULL,
  group_color text DEFAULT 'yellow' NOT NULL,
  group_label text DEFAULT '' NOT NULL,
  interval_str text DEFAULT '1 เดือน' NOT NULL,
  interval_days integer DEFAULT 30 NOT NULL,
  note text DEFAULT '' NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  record_type text DEFAULT 'injection',
  recorded_by text,
  medication_name text
);

CREATE TABLE IF NOT EXISTS public.home_visits (
  id bigserial PRIMARY KEY,
  patient_name text DEFAULT '' NOT NULL,
  village text DEFAULT '' NOT NULL,
  visit_date date NOT NULL,
  visitor text DEFAULT '' NOT NULL,
  visit_type text DEFAULT 'aosomo' NOT NULL,
  checklist text[] DEFAULT '{}' NOT NULL,
  score integer DEFAULT 0 NOT NULL,
  refer boolean DEFAULT false NOT NULL,
  note text DEFAULT '' NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  checks_json text DEFAULT '[]',
  patient_id integer REFERENCES public.patients(id),
  refer_resolved boolean DEFAULT false,
  photo_url text,
  assessment_json jsonb,
  verified_by varchar,
  verified_at date,
  verify_result varchar,
  verify_note text
);

CREATE TABLE IF NOT EXISTS public.doctor_appointments (
  id serial PRIMARY KEY,
  patient_id integer NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  appoint_date date NOT NULL,
  appoint_type varchar DEFAULT 'medicine',
  hospital varchar DEFAULT '',
  doctor_name varchar,
  note text,
  status varchar DEFAULT 'scheduled',
  created_by varchar,
  created_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text DEFAULT '' NOT NULL,
  display_name text DEFAULT '' NOT NULL,
  role text DEFAULT 'viewer' NOT NULL CHECK (role IN ('admin', 'staff', 'aosomo', 'viewer')),
  created_at timestamptz DEFAULT now() NOT NULL,
  last_login timestamptz,
  village text DEFAULT '' NOT NULL,
  national_id text,
  profile_file_url text,
  status text DEFAULT 'active',
  confidentiality_version text,
  confidentiality_accepted_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.app_settings (
  setting_key text PRIMARY KEY,
  setting_value text DEFAULT '' NOT NULL
);

CREATE TABLE IF NOT EXISTS public.notification_settings (
  id integer DEFAULT 1 PRIMARY KEY,
  telegram_bot_token text,
  telegram_chat_id text,
  enabled boolean DEFAULT true
);
INSERT INTO public.notification_settings (id, enabled) VALUES (1, true) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id bigserial PRIMARY KEY,
  user_id uuid,
  user_email text,
  user_name text,
  action text NOT NULL,
  entity_type text,
  entity_id text,
  details jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.login_lockouts (
  id serial PRIMARY KEY,
  email varchar NOT NULL UNIQUE,
  attempt_count integer DEFAULT 0,
  locked_until timestamptz,
  last_attempt timestamptz DEFAULT now(),
  unlocked_by varchar,
  unlocked_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.aosomo_directory (
  id bigserial PRIMARY KEY,
  name text NOT NULL,
  village text DEFAULT '' NOT NULL,
  phone text DEFAULT '' NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  line_id text
);

CREATE TABLE IF NOT EXISTS public.staff_directory (
  id bigserial PRIMARY KEY,
  name text NOT NULL,
  "position" text DEFAULT '' NOT NULL,
  phone text DEFAULT '' NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- สำรองข้อมูลผู้ป่วยรายวัน เก็บ 7 วัน (เข้าถึงได้จาก SQL Editor เท่านั้น)
CREATE TABLE IF NOT EXISTS public.patients_backup (
  id bigserial PRIMARY KEY,
  backup_date date DEFAULT CURRENT_DATE NOT NULL,
  data jsonb NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- ─── 2. ดัชนี ─────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS jh_ix_patients_village      ON public.patients (village);
CREATE INDEX IF NOT EXISTS jh_ix_patients_next_inject  ON public.patients (next_inject_date);
CREATE INDEX IF NOT EXISTS jh_ix_patients_next_visit   ON public.patients (next_visit_date);
CREATE INDEX IF NOT EXISTS jh_ix_inj_date              ON public.injection_records (injection_date);
CREATE INDEX IF NOT EXISTS jh_ix_inj_patient_date      ON public.injection_records (patient_id, injection_date DESC);
CREATE INDEX IF NOT EXISTS jh_ix_visit_date            ON public.home_visits (visit_date DESC);
CREATE INDEX IF NOT EXISTS jh_ix_visit_patient         ON public.home_visits (patient_id);
CREATE INDEX IF NOT EXISTS jh_ix_visit_village_date    ON public.home_visits (village, visit_date DESC);
CREATE INDEX IF NOT EXISTS jh_ix_visit_refer_pending   ON public.home_visits (visit_type, visit_date) WHERE refer AND NOT refer_resolved;
CREATE INDEX IF NOT EXISTS jh_ix_appt_date             ON public.doctor_appointments (appoint_date);
CREATE INDEX IF NOT EXISTS jh_ix_appt_patient          ON public.doctor_appointments (patient_id);
CREATE INDEX IF NOT EXISTS jh_ix_audit_created         ON public.audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS jh_ix_audit_user            ON public.audit_logs (user_id);
CREATE INDEX IF NOT EXISTS jh_ix_profiles_role         ON public.user_profiles (role);
CREATE INDEX IF NOT EXISTS jh_ix_profiles_status       ON public.user_profiles (status);

-- ─── 3. View ──────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.patient_status WITH (security_invoker = true) AS
 SELECT p.id, p.name, p.village, p.note, p.house_no, p.national_id,
    p.disease_code, p.disease_name, p.medication_name, p.oral_medication,
    p.staff_responsible, p.aosomo_responsible, p.visit_interval, p.inject_interval,
    p.next_visit_date, p.photo_urls, p.file_url,
    ir.injection_date AS last_date, ir.group_color, ir.group_label,
    ir.interval_str, ir.interval_days, ir.note AS last_note,
    CASE WHEN ir.injection_date > CURRENT_DATE THEN ir.injection_date
         ELSE (ir.injection_date + (ir.interval_days || ' days')::interval)::date END AS next_date,
    CASE WHEN ir.injection_date > CURRENT_DATE THEN ir.injection_date - CURRENT_DATE
         ELSE (ir.injection_date + (ir.interval_days || ' days')::interval)::date - CURRENT_DATE END AS days_until
   FROM public.patients p
   LEFT JOIN LATERAL (
     SELECT r.injection_date, r.group_color, r.group_label, r.interval_str, r.interval_days, r.note
     FROM public.injection_records r
     WHERE r.patient_id = p.id
     ORDER BY r.injection_date DESC, r.id DESC
     LIMIT 1) ir ON true;

CREATE OR REPLACE VIEW public.monthly_trend WITH (security_invoker = true) AS
 SELECT to_char(injection_date, 'YYYY-MM') AS month_key,
    count(*) AS total,
    count(*) FILTER (WHERE group_color = 'red') AS red_count,
    count(*) FILTER (WHERE group_color = 'yellow') AS yellow_count,
    count(*) FILTER (WHERE group_color = 'green') AS green_count
   FROM public.injection_records
  GROUP BY 1
  ORDER BY 1;

-- ─── 4. ฟังก์ชันตรวจสิทธิ์ ────────────────────────────────────────
-- role ของผู้ใช้ที่ login อยู่ เฉพาะบัญชี active (pending / suspended / ไม่ได้ login → NULL)
CREATE OR REPLACE FUNCTION public.jh_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.user_profiles
  WHERE id = auth.uid() AND COALESCE(status, 'active') = 'active'
$$;

-- หมู่บ้านของผู้ใช้ที่ login อยู่ (ว่าง → NULL)
CREATE OR REPLACE FUNCTION public.jh_village()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NULLIF(trim(village), '') FROM public.user_profiles
  WHERE id = auth.uid() AND COALESCE(status, 'active') = 'active'
$$;

-- เห็นข้อมูลของหมู่บ้าน v ได้ไหม: แอดมิน/เจ้าหน้าที่/ผู้สังเกตการณ์ เห็นทั้งหมด
-- อสม. เห็นเฉพาะหมู่บ้านตัวเอง (ยังไม่กำหนดหมู่บ้าน → เห็นทั้งหมด ชั่วคราว)
CREATE OR REPLACE FUNCTION public.jh_sees_village(v text)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT CASE public.jh_role()
    WHEN 'admin'  THEN true
    WHEN 'staff'  THEN true
    WHEN 'viewer' THEN true
    WHEN 'aosomo' THEN public.jh_village() IS NULL OR v = public.jh_village()
    ELSE false END
$$;

-- ผู้ใช้แก้ role / status / หมู่บ้านของตัวเองไม่ได้ · ผู้สมัครคนแรกของระบบเป็นแอดมิน
CREATE OR REPLACE FUNCTION public.jh_protect_profile()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE caller_role text;
BEGIN
  -- SQL Editor / service_role / Edge Function → ผ่าน
  IF auth.uid() IS NULL AND current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'กรุณาเข้าสู่ระบบ';
  END IF;

  caller_role := public.jh_role();
  IF caller_role = 'admin' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.id <> auth.uid() THEN
      RAISE EXCEPTION 'ไม่มีสิทธิ์สร้างโปรไฟล์ของผู้อื่น';
    END IF;
    IF NEW.role = 'admin' AND NOT EXISTS (SELECT 1 FROM public.user_profiles) THEN
      NEW.status := 'active';
    ELSIF NEW.role = 'aosomo' THEN
      NEW.status := 'pending';
    ELSE
      NEW.role := 'viewer';
      NEW.status := 'pending';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.role IS DISTINCT FROM OLD.role
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.village IS DISTINCT FROM OLD.village
     OR NEW.email IS DISTINCT FROM OLD.email THEN
    RAISE EXCEPTION 'ไม่มีสิทธิ์แก้ไขบทบาท สถานะ หรือหมู่บ้าน — ติดต่อผู้ดูแลระบบ';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS jh_protect_profile ON public.user_profiles;
CREATE TRIGGER jh_protect_profile
  BEFORE INSERT OR UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.jh_protect_profile();

-- ─── 5. ฟังก์ชันหน้า login ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_login_lock(p_email text)
RETURNS TABLE (locked_until timestamptz, attempt_count integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT l.locked_until, l.attempt_count::int
  FROM public.login_lockouts l
  WHERE l.email = lower(p_email)
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.get_public_settings()
RETURNS TABLE (setting_key text, setting_value text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.setting_key, s.setting_value
  FROM public.app_settings s
  WHERE s.setting_key IN ('app_subtitle', 'hospital_name')
$$;

-- ใส่รหัสผิด 5 ครั้ง → ล็อก 15 นาที
CREATE OR REPLACE FUNCTION public.record_failed_login(p_email text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE new_count integer;
BEGIN
  INSERT INTO login_lockouts (email, attempt_count, locked_until, last_attempt, unlocked_by, unlocked_at)
  VALUES (lower(p_email), 1, NULL, now(), NULL, NULL)
  ON CONFLICT (email) DO UPDATE SET
    attempt_count = login_lockouts.attempt_count + 1,
    locked_until  = CASE WHEN login_lockouts.attempt_count + 1 >= 5
                         THEN now() + interval '15 minutes' ELSE NULL END,
    last_attempt  = now(),
    unlocked_by   = NULL,
    unlocked_at   = NULL
  RETURNING attempt_count INTO new_count;
  RETURN new_count;
END;
$$;

-- ─── 6. งานเบื้องหลัง ─────────────────────────────────────────────
-- รายงาน Telegram ประจำวัน: ผู้ป่วยเกินนัดและนัดพรุ่งนี้ (ชื่อเต็ม — กลุ่มต้องมีเฉพาะเจ้าหน้าที่)
CREATE OR REPLACE FUNCTION public.send_overdue_notification()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  bot_token   text;
  chat_id     text;
  today       date := CURRENT_DATE;
  tomorrow    date := CURRENT_DATE + 1;
  th_months   text[] := ARRAY['','ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  th_date     text := EXTRACT(DAY FROM today)||' '||th_months[EXTRACT(MONTH FROM today)]||' '||(EXTRACT(YEAR FROM today)+543)::int;
  th_tomorrow text := EXTRACT(DAY FROM tomorrow)||' '||th_months[EXTRACT(MONTH FROM tomorrow)]||' '||(EXTRACT(YEAR FROM tomorrow)+543)::int;
  hosp        text;
  msg         text := '';
  inj_cnt int := 0; visit_cnt int := 0; appt_cnt int := 0;
  tinj_cnt int := 0; tvisit_cnt int := 0; tappt_cnt int := 0;
  r record;
BEGIN
  SELECT telegram_bot_token, telegram_chat_id INTO bot_token, chat_id
  FROM notification_settings WHERE enabled = true LIMIT 1;
  IF COALESCE(bot_token, '') = '' OR COALESCE(chat_id, '') = '' THEN RETURN 'disabled'; END IF;
  SELECT NULLIF(setting_value, '') INTO hosp FROM app_settings WHERE setting_key = 'hospital_name';

  SELECT count(*) INTO inj_cnt   FROM patients WHERE next_inject_date < today;
  SELECT count(*) INTO visit_cnt FROM patients WHERE next_visit_date  < today;
  SELECT count(*) INTO appt_cnt  FROM doctor_appointments WHERE appoint_date < today AND status NOT IN ('done','missed');
  SELECT count(*) INTO tinj_cnt   FROM patients WHERE next_inject_date = tomorrow;
  SELECT count(*) INTO tvisit_cnt FROM patients WHERE next_visit_date  = tomorrow;
  SELECT count(*) INTO tappt_cnt  FROM doctor_appointments WHERE appoint_date = tomorrow AND status NOT IN ('done','missed');

  IF inj_cnt = 0 AND visit_cnt = 0 AND appt_cnt = 0 AND tinj_cnt = 0 AND tvisit_cnt = 0 AND tappt_cnt = 0 THEN
    RETURN 'no_data';
  END IF;

  msg := '🏥 <b>JitHome — รายงานวันนี้</b>' || COALESCE(' · ' || hosp, '') || chr(10) || '📅 ' || th_date || chr(10);

  IF tinj_cnt > 0 OR tvisit_cnt > 0 OR tappt_cnt > 0 THEN
    msg := msg || chr(10) || '📌 <b>นัดพรุ่งนี้ (' || th_tomorrow || ')</b>' || chr(10);
    IF tinj_cnt > 0 THEN
      msg := msg || chr(10) || '💉 นัดฉีดยา ' || tinj_cnt || ' ราย' || chr(10);
      FOR r IN SELECT name, village FROM patients WHERE next_inject_date = tomorrow ORDER BY village, name LIMIT 15 LOOP
        msg := msg || '• ' || r.name || ' (' || COALESCE(NULLIF(r.village,''),'—') || ')' || chr(10);
      END LOOP;
      IF tinj_cnt > 15 THEN msg := msg || '…และอีก ' || (tinj_cnt-15) || ' ราย' || chr(10); END IF;
    END IF;
    IF tvisit_cnt > 0 THEN
      msg := msg || chr(10) || '🏡 นัดเยี่ยมบ้าน ' || tvisit_cnt || ' ราย' || chr(10);
      FOR r IN SELECT name, village FROM patients WHERE next_visit_date = tomorrow ORDER BY village, name LIMIT 15 LOOP
        msg := msg || '• ' || r.name || ' (' || COALESCE(NULLIF(r.village,''),'—') || ')' || chr(10);
      END LOOP;
      IF tvisit_cnt > 15 THEN msg := msg || '…และอีก ' || (tvisit_cnt-15) || ' ราย' || chr(10); END IF;
    END IF;
    IF tappt_cnt > 0 THEN
      msg := msg || chr(10) || '🏥 นัดพบแพทย์ ' || tappt_cnt || ' ราย' || chr(10);
      FOR r IN SELECT p.name, p.village, da.hospital FROM doctor_appointments da JOIN patients p ON p.id = da.patient_id
               WHERE da.appoint_date = tomorrow AND da.status NOT IN ('done','missed')
               ORDER BY p.village, p.name LIMIT 10 LOOP
        msg := msg || '• ' || r.name || ' (' || COALESCE(NULLIF(r.village,''),'—') || ')' || COALESCE(' → ' || NULLIF(r.hospital,''), '') || chr(10);
      END LOOP;
      IF tappt_cnt > 10 THEN msg := msg || '…และอีก ' || (tappt_cnt-10) || ' ราย' || chr(10); END IF;
    END IF;
  END IF;

  IF inj_cnt > 0 OR visit_cnt > 0 OR appt_cnt > 0 THEN
    msg := msg || chr(10) || '─────────────' || chr(10) || '⚠️ <b>เกินนัด</b>' || chr(10);
    IF inj_cnt > 0 THEN
      msg := msg || chr(10) || '💉 เกินนัดฉีดยา ' || inj_cnt || ' ราย' || chr(10);
      FOR r IN SELECT name, village, today - next_inject_date AS days FROM patients
               WHERE next_inject_date < today ORDER BY next_inject_date LIMIT 15 LOOP
        msg := msg || '• ' || r.name || ' (' || COALESCE(NULLIF(r.village,''),'—') || ') เกิน ' || r.days || ' วัน' || chr(10);
      END LOOP;
      IF inj_cnt > 15 THEN msg := msg || '…และอีก ' || (inj_cnt-15) || ' ราย' || chr(10); END IF;
    END IF;
    IF visit_cnt > 0 THEN
      msg := msg || chr(10) || '🏡 เกินนัดเยี่ยมบ้าน ' || visit_cnt || ' ราย' || chr(10);
      FOR r IN SELECT name, village, today - next_visit_date AS days FROM patients
               WHERE next_visit_date < today ORDER BY next_visit_date LIMIT 15 LOOP
        msg := msg || '• ' || r.name || ' (' || COALESCE(NULLIF(r.village,''),'—') || ') เกิน ' || r.days || ' วัน' || chr(10);
      END LOOP;
      IF visit_cnt > 15 THEN msg := msg || '…และอีก ' || (visit_cnt-15) || ' ราย' || chr(10); END IF;
    END IF;
    IF appt_cnt > 0 THEN
      msg := msg || chr(10) || '🏥 เกินนัดพบแพทย์ ' || appt_cnt || ' ราย' || chr(10);
      FOR r IN SELECT p.name, p.village, today - da.appoint_date AS days
               FROM doctor_appointments da JOIN patients p ON p.id = da.patient_id
               WHERE da.appoint_date < today AND da.status NOT IN ('done','missed')
               ORDER BY da.appoint_date LIMIT 10 LOOP
        msg := msg || '• ' || r.name || ' (' || COALESCE(NULLIF(r.village,''),'—') || ') เกิน ' || r.days || ' วัน' || chr(10);
      END LOOP;
      IF appt_cnt > 10 THEN msg := msg || '…และอีก ' || (appt_cnt-10) || ' ราย' || chr(10); END IF;
    END IF;
  END IF;

  PERFORM net.http_post(
    url  := 'https://api.telegram.org/bot' || bot_token || '/sendMessage',
    body := jsonb_build_object('chat_id', chat_id, 'text', msg, 'parse_mode', 'HTML')
  );
  RETURN 'sent';
END;
$$;

CREATE OR REPLACE FUNCTION public.backup_patients_data()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count int;
BEGIN
  DELETE FROM patients_backup WHERE backup_date < CURRENT_DATE - interval '7 days';
  IF EXISTS (SELECT 1 FROM patients_backup WHERE backup_date = CURRENT_DATE) THEN
    RETURN 'already_done';
  END IF;
  INSERT INTO patients_backup (backup_date, data)
    SELECT CURRENT_DATE, row_to_json(p)::jsonb FROM patients p;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN 'backed_up:' || v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_old_audit_logs()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM audit_logs WHERE created_at < now() - interval '1 year';
$$;

CREATE OR REPLACE FUNCTION public.cleanup_old_lockouts()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM login_lockouts
  WHERE (locked_until IS NULL OR locked_until < now())
    AND last_attempt < now() - interval '30 days';
$$;

-- ─── 7. สิทธิ์เรียกฟังก์ชัน ───────────────────────────────────────
-- ค่าเริ่มต้นของ Postgres ให้ทุกคน (รวมคนที่ไม่ได้ login) เรียกฟังก์ชันได้ — ถอนออกทีละตัว
REVOKE ALL ON FUNCTION public.jh_role(), public.jh_village(), public.jh_sees_village(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.jh_role(), public.jh_village(), public.jh_sees_village(text) TO authenticated;
REVOKE ALL ON FUNCTION public.check_login_lock(text), public.get_public_settings(), public.record_failed_login(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_login_lock(text), public.get_public_settings(), public.record_failed_login(text) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.send_overdue_notification() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_overdue_notification() TO authenticated;
REVOKE ALL ON FUNCTION public.backup_patients_data(), public.cleanup_old_audit_logs(), public.cleanup_old_lockouts()
  FROM PUBLIC, anon, authenticated;

-- ─── 8. Row Level Security ────────────────────────────────────────
DO $$
DECLARE t text; r record;
BEGIN
  FOREACH t IN ARRAY ARRAY['patients','injection_records','home_visits','doctor_appointments',
                           'app_settings','user_profiles','audit_logs','login_lockouts',
                           'aosomo_directory','staff_directory','notification_settings','patients_backup'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    -- ล้าง policy เดิม (รันซ้ำได้)
    FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, t);
    END LOOP;
    IF t = 'patients_backup' THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM authenticated', t);
    ELSE
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    END IF;
  END LOOP;
END $$;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;
REVOKE ALL ON public.patient_status, public.monthly_trend FROM anon;
GRANT SELECT ON public.patient_status, public.monthly_trend TO authenticated;

-- ข้อมูลผู้ป่วย: อ่าน/แก้ตามหมู่บ้าน · เพิ่ม: แอดมิน เจ้าหน้าที่ อสม. · ลบ: แอดมิน เจ้าหน้าที่ (+อสม. ลบบันทึกเยี่ยม)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['patients', 'home_visits'] LOOP
    EXECUTE format($p$CREATE POLICY jh_select ON public.%I FOR SELECT TO authenticated
                    USING (public.jh_sees_village(village))$p$, t);
    EXECUTE format($p$CREATE POLICY jh_update ON public.%I FOR UPDATE TO authenticated
                    USING (public.jh_role() IN ('admin','staff','aosomo') AND public.jh_sees_village(village))
                    WITH CHECK (public.jh_role() IN ('admin','staff','aosomo'))$p$, t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['injection_records', 'doctor_appointments'] LOOP
    EXECUTE format($p$CREATE POLICY jh_select ON public.%I FOR SELECT TO authenticated
                    USING (public.jh_role() IN ('admin','staff','viewer')
                           OR (public.jh_role() = 'aosomo' AND (public.jh_village() IS NULL
                               OR EXISTS (SELECT 1 FROM public.patients p WHERE p.id = patient_id AND p.village = public.jh_village()))))$p$, t);
    EXECUTE format($p$CREATE POLICY jh_update ON public.%I FOR UPDATE TO authenticated
                    USING (public.jh_role() IN ('admin','staff')
                           OR (public.jh_role() = 'aosomo' AND (public.jh_village() IS NULL
                               OR EXISTS (SELECT 1 FROM public.patients p WHERE p.id = patient_id AND p.village = public.jh_village()))))
                    WITH CHECK (public.jh_role() IN ('admin','staff','aosomo'))$p$, t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['patients','injection_records','home_visits','doctor_appointments'] LOOP
    EXECUTE format($p$CREATE POLICY jh_insert ON public.%I FOR INSERT TO authenticated
                    WITH CHECK (public.jh_role() IN ('admin','staff','aosomo'))$p$, t);
    EXECUTE format($p$CREATE POLICY jh_delete ON public.%I FOR DELETE TO authenticated
                    USING (public.jh_role() IN ('admin','staff')
                           OR (%L = 'home_visits' AND public.jh_role() = 'aosomo'))$p$, t, t);
  END LOOP;
END $$;

-- ตั้งค่า: token อ่านได้เฉพาะแอดมิน · แก้: แอดมิน
CREATE POLICY jh_select ON public.app_settings FOR SELECT TO authenticated
  USING (public.jh_role() = 'admin'
         OR (public.jh_role() IS NOT NULL
             AND setting_key NOT IN ('line_token', 'telegram_token', 'refer_line_token', 'refer_telegram_token')));
CREATE POLICY jh_write ON public.app_settings FOR ALL TO authenticated
  USING (public.jh_role() = 'admin') WITH CHECK (public.jh_role() = 'admin');

-- สมาชิก (trigger jh_protect_profile คุม role/status อีกชั้น)
CREATE POLICY jh_select ON public.user_profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.jh_role() IS NOT NULL);
CREATE POLICY jh_insert ON public.user_profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid() OR public.jh_role() = 'admin');
CREATE POLICY jh_update ON public.user_profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.jh_role() = 'admin')
  WITH CHECK (id = auth.uid() OR public.jh_role() = 'admin');
CREATE POLICY jh_delete ON public.user_profiles FOR DELETE TO authenticated
  USING (public.jh_role() = 'admin');

-- ประวัติการใช้งาน: ทุกคนเพิ่มได้ (รวมบันทึก login ล้มเหลวก่อน login) · อ่าน: แอดมิน
GRANT INSERT ON public.audit_logs TO anon;
GRANT USAGE ON SEQUENCE public.audit_logs_id_seq TO anon;
CREATE POLICY jh_insert_anon ON public.audit_logs FOR INSERT TO anon WITH CHECK (user_id IS NULL);
CREATE POLICY jh_insert ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());
CREATE POLICY jh_select ON public.audit_logs FOR SELECT TO authenticated
  USING (public.jh_role() = 'admin');

-- ทะเบียน อสม. / เจ้าหน้าที่: อ่าน: ทุกบทบาท · แก้: แอดมิน
CREATE POLICY jh_select ON public.aosomo_directory FOR SELECT TO authenticated USING (public.jh_role() IS NOT NULL);
CREATE POLICY jh_write  ON public.aosomo_directory FOR ALL TO authenticated
  USING (public.jh_role() = 'admin') WITH CHECK (public.jh_role() = 'admin');
CREATE POLICY jh_select ON public.staff_directory FOR SELECT TO authenticated USING (public.jh_role() IS NOT NULL);
CREATE POLICY jh_write  ON public.staff_directory FOR ALL TO authenticated
  USING (public.jh_role() = 'admin') WITH CHECK (public.jh_role() = 'admin');

-- การล็อกบัญชี: แอดมินจัดการ · ผู้ใช้ล้างล็อกของตัวเองหลัง login สำเร็จ
CREATE POLICY jh_admin ON public.login_lockouts FOR ALL TO authenticated
  USING (public.jh_role() = 'admin') WITH CHECK (public.jh_role() = 'admin');
CREATE POLICY jh_select_own ON public.login_lockouts FOR SELECT TO authenticated
  USING (email = lower(auth.jwt() ->> 'email'));
CREATE POLICY jh_clear_own ON public.login_lockouts FOR DELETE TO authenticated
  USING (email = lower(auth.jwt() ->> 'email'));

-- ค่า Telegram สำหรับรายงานประจำวัน: แอดมินเท่านั้น
CREATE POLICY jh_admin ON public.notification_settings FOR ALL TO authenticated
  USING (public.jh_role() = 'admin') WITH CHECK (public.jh_role() = 'admin');

-- ─── 9. ไฟล์ผู้ป่วย (Storage) ─────────────────────────────────────
-- bucket แบบ private: เปิดไฟล์ผ่าน signed URL เท่านั้น
INSERT INTO storage.buckets (id, name, public) VALUES ('patient-files', 'patient-files', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS jh_files_select ON storage.objects;
DROP POLICY IF EXISTS jh_files_insert ON storage.objects;
DROP POLICY IF EXISTS jh_files_update ON storage.objects;
DROP POLICY IF EXISTS jh_files_delete ON storage.objects;
CREATE POLICY jh_files_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'patient-files' AND public.jh_role() IN ('admin', 'staff', 'aosomo'));
-- ผู้สมัคร อสม. ที่ยังรออนุมัติ อัปโหลดสำเนาบัตรได้เฉพาะโฟลเดอร์ members/
CREATE POLICY jh_files_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'patient-files'
              AND (public.jh_role() IN ('admin', 'staff', 'aosomo')
                   OR (auth.uid() IS NOT NULL AND (storage.foldername(name))[1] = 'members')));
CREATE POLICY jh_files_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'patient-files' AND public.jh_role() IN ('admin', 'staff'))
  WITH CHECK (bucket_id = 'patient-files' AND public.jh_role() IN ('admin', 'staff'));
CREATE POLICY jh_files_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'patient-files' AND public.jh_role() = 'admin');

-- ─── 10. ตั้งเวลา ─────────────────────────────────────────────────
-- เวลาเป็น UTC: 00:00 UTC = 07:00 น. เวลาไทย
DO $$
DECLARE j record;
BEGIN
  IF to_regnamespace('cron') IS NULL THEN
    RAISE NOTICE 'ยังไม่ได้เปิด pg_cron — รายงาน Telegram อัตโนมัติจะยังไม่ทำงาน';
    RETURN;
  END IF;
  FOR j IN SELECT jobid FROM cron.job WHERE jobname IN
           ('jithome-daily-notification', 'jithome-daily-backup', 'jithome-weekly-cleanup') LOOP
    PERFORM cron.unschedule(j.jobid);
  END LOOP;
  PERFORM cron.schedule('jithome-daily-notification', '0 0 * * *', 'SELECT public.send_overdue_notification()');
  PERFORM cron.schedule('jithome-daily-backup',       '0 20 * * *', 'SELECT public.backup_patients_data()');
  PERFORM cron.schedule('jithome-weekly-cleanup',     '0 21 * * 0',
                        'SELECT public.cleanup_old_lockouts(); SELECT public.cleanup_old_audit_logs()');
END $$;

-- ─── ตรวจผล ───────────────────────────────────────────────────────
SELECT CASE WHEN missing = '' THEN 'ติดตั้งเสร็จ' ELSE 'ยังไม่ครบ: ' || missing END AS ผลการติดตั้ง
FROM (
  SELECT concat_ws(', ',
    CASE WHEN (SELECT count(*) FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace
               AND c.relkind = 'r' AND NOT c.relrowsecurity) > 0 THEN 'มีตารางที่ยังไม่เปิด RLS' END,
    CASE WHEN to_regprocedure('public.jh_role()') IS NULL THEN 'jh_role' END,
    CASE WHEN NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'patient-files') THEN 'bucket patient-files' END,
    CASE WHEN to_regnamespace('net') IS NULL THEN 'pg_net (รายงาน Telegram)' END,
    CASE WHEN to_regnamespace('cron') IS NULL THEN 'pg_cron (ตั้งเวลารายงาน)' END
  ) AS missing
) x;
