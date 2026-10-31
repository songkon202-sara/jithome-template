-- ═══════════════════════════════════════════════════════════════════
-- JitHome Security — ขั้นที่ 1: เตรียมระบบ (รันได้ทันที ไม่กระทบการใช้งานเดิม)
-- รันใน Supabase Dashboard → SQL Editor
--
-- สิ่งที่ทำ:
--   1. ฟังก์ชันช่วยตรวจสิทธิ์ (jh_role) สำหรับใช้ใน RLS policy ขั้นที่ 2
--   2. ป้องกันผู้ใช้แก้ role/status ของตัวเอง (ปิดช่องตั้งตัวเองเป็น admin)
--   3. RPC สำหรับหน้าก่อน login: check_login_lock, get_public_settings
--
-- รันซ้ำได้ (idempotent)
-- ═══════════════════════════════════════════════════════════════════

-- แอปใช้คอลัมน์ status อยู่แล้ว — เพิ่มไว้เผื่อฐานข้อมูลที่ยังไม่มี
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS status TEXT;

-- ─── 1. ฟังก์ชันตรวจสิทธิ์ ─────────────────────────────────────────
-- คืน role ของผู้ใช้ที่ login อยู่ เฉพาะบัญชีที่ active
-- (pending / rejected / deleted / ไม่ได้ login → NULL)
-- SECURITY DEFINER เพื่อไม่ให้ติด RLS ของ user_profiles เอง (กัน recursion)
CREATE OR REPLACE FUNCTION public.jh_role()
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_profiles
  WHERE id = auth.uid() AND COALESCE(status, 'active') = 'active'
$$;
REVOKE ALL ON FUNCTION public.jh_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.jh_role() TO authenticated;

-- ─── 2. ป้องกันการแก้ role/status ด้วยตัวเอง ───────────────────────
CREATE OR REPLACE FUNCTION public.jh_protect_profile()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role TEXT;
BEGIN
  -- SQL Editor / service_role / Edge Function ที่ใช้ service key → ผ่าน
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
      -- ผู้ใช้คนแรกของระบบ → admin (ตามพฤติกรรมเดิมของแอป)
      NEW.status := 'active';
    ELSIF NEW.role = 'aosomo' THEN
      NEW.status := 'pending';
    ELSE
      -- สมัครเองทุกกรณีอื่น → viewer รออนุมัติ
      NEW.role := 'viewer';
      NEW.status := 'pending';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE โดยผู้ที่ไม่ใช่ admin: แก้ได้เฉพาะข้อมูลทั่วไปของตัวเอง
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

-- ─── 3. RPC สำหรับหน้าก่อน login ─────────────────────────────────
-- ตรวจสถานะล็อกบัญชี (แทนการ SELECT ตาราง login_lockouts โดยตรง)
CREATE OR REPLACE FUNCTION public.check_login_lock(p_email TEXT)
RETURNS TABLE (locked_until TIMESTAMPTZ, attempt_count INT)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT l.locked_until, l.attempt_count::INT
  FROM public.login_lockouts l
  WHERE l.email = lower(p_email)
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.check_login_lock(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_login_lock(TEXT) TO anon, authenticated;

-- ค่าตั้งค่าที่แสดงได้ก่อน login (ไม่รวม token ใดๆ)
CREATE OR REPLACE FUNCTION public.get_public_settings()
RETURNS TABLE (setting_key TEXT, setting_value TEXT)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.setting_key::TEXT, s.setting_value::TEXT
  FROM public.app_settings s
  WHERE s.setting_key IN ('app_subtitle', 'hospital_name')
$$;
REVOKE ALL ON FUNCTION public.get_public_settings() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_settings() TO anon, authenticated;

-- record_failed_login (มีอยู่แล้วในฐานข้อมูล ไม่ได้อยู่ใน repo) ถูกเรียกก่อน login
-- ต้องเป็น SECURITY DEFINER ไม่อย่างนั้นหลังขั้นที่ 2 (anon ไม่มีสิทธิ์ login_lockouts)
-- จะนับการใส่รหัสผิดไม่ได้ และระบบล็อกบัญชีจะหยุดทำงาน
DO $$
DECLARE f REGPROCEDURE;
BEGIN
  FOR f IN SELECT oid::regprocedure FROM pg_proc
           WHERE pronamespace = 'public'::regnamespace AND proname = 'record_failed_login' LOOP
    EXECUTE format('ALTER FUNCTION %s SECURITY DEFINER SET search_path = public', f);
  END LOOP;
END $$;

-- ─── ตรวจผล ───────────────────────────────────────────────────────
-- ควรเห็น role ของบัญชีที่ใช้ทดสอบ (รันใน SQL Editor จะได้ NULL เพราะไม่ได้ login ผ่านแอป)
SELECT 'ขั้นที่ 1 เสร็จ' AS status,
       (SELECT count(*) FROM public.user_profiles WHERE role = 'admin' AND COALESCE(status,'active') = 'active') AS active_admins;
