-- ═══════════════════════════════════════════════════════════════════
-- JitHome Security — ขั้นที่ 7: ปิดฟังก์ชัน/ตารางที่ข้าม RLS ได้
-- (รันแล้วในฐานข้อมูลจริงเมื่อ 2026-09-28 — ไฟล์นี้เก็บไว้เป็นบันทึก/ติดตั้งใหม่)
--
-- ฟังก์ชัน SECURITY DEFINER ทำงานด้วยสิทธิ์เจ้าของ (ข้าม RLS) และโดยค่าเริ่มต้น
-- ของ Postgres ทุกคน (รวม anon) เรียกผ่าน API ได้ — ต้องถอนสิทธิ์ทีละตัว
-- งาน cron / pg_net รันด้วยสิทธิ์ระบบ จึงไม่กระทบ
-- ═══════════════════════════════════════════════════════════════════

-- ส่งรายงาน Telegram (ปุ่มในหน้าแอดมิน) — เฉพาะผู้ที่ login
REVOKE EXECUTE ON FUNCTION public.send_overdue_notification() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.send_overdue_notification() TO authenticated;

-- ฟังก์ชันที่แอปไม่ได้ใช้ — ปิดทั้งหมด
--   build_notification_message : คืนข้อความที่มีรายชื่อผู้ป่วย
--   backup_patients_data       : สำรองข้อมูล (งาน cron)
--   cleanup_old_lockouts       : ล้างการล็อกบัญชี (คนนอกเรียกได้ = เดารหัสผ่านต่อได้)
--   cleanup_old_audit_logs     : ลบประวัติการใช้งาน
--   authenticate               : login ระบบเก่า (ตาราง users) ไม่มีการล็อกเมื่อใส่ผิด
DO $$
DECLARE f REGPROCEDURE;
BEGIN
  FOR f IN SELECT oid::regprocedure FROM pg_proc
           WHERE pronamespace = 'public'::regnamespace
             AND proname IN ('build_notification_message', 'backup_patients_data',
                             'cleanup_old_lockouts', 'cleanup_old_audit_logs', 'authenticate') LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
  END LOOP;
END $$;

-- patients_backup: เดิมมี policy auth_all ให้ทุกคนที่ login อ่านข้อมูลสำรองผู้ป่วยได้
-- users: ตารางของระบบเก่า
-- ทั้งสองตารางแอปไม่ได้ใช้ — ปิดการเข้าถึงจาก API (SQL Editor / cron ยังใช้ได้)
DROP POLICY IF EXISTS auth_all ON public.patients_backup;
REVOKE ALL ON public.patients_backup FROM anon, authenticated;
REVOKE ALL ON public.users           FROM anon, authenticated;

-- ตรวจผล: ฟังก์ชันที่ anon ยังเรียกได้ ควรเหลือเฉพาะที่หน้า login ใช้
-- (check_login_lock, get_public_settings, record_failed_login) + trigger jh_protect_profile
SELECT p.proname, p.prosecdef AS bypasses_rls,
       has_function_privilege('anon', p.oid, 'execute') AS anon_can_call
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
ORDER BY anon_can_call DESC, p.proname;
