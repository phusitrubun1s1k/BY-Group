-- =====================================================================
-- ซ่อนเบอร์โทร/อีเมลจากสมาชิกคนอื่น
--
-- ปัญหา: profiles ต้องให้ทุกคนอ่านได้ (ชื่อ/ระดับ/MMR ใช้ใน leaderboard, live, match)
-- แต่ RLS กรองได้ทีละ "แถว" ไม่ใช่ "คอลัมน์" → เบอร์โทร/อีเมลหลุดไปด้วย
--
-- แก้: ย้าย email/phone ไปตารางแยก profile_contacts ที่อ่านได้เฉพาะเจ้าของ + แอดมิน
--   * trigger บน profiles จะย้าย email/phone ที่ถูกเขียนเข้ามา (เช่นตอนสมัคร) ไป profile_contacts
--     แล้วล้างใน profiles ให้เป็น NULL อัตโนมัติ → โค้ดสมัครสมาชิกเดิมใช้ได้โดยไม่ต้องแก้
-- รันซ้ำได้ปลอดภัย
-- =====================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.profile_contacts (
    user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    email text,
    phone text,
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profile_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profile_contacts_read ON public.profile_contacts;
CREATE POLICY profile_contacts_read ON public.profile_contacts FOR SELECT TO authenticated
    USING (user_id = (SELECT auth.uid()) OR public.integrity_is_admin());

DROP POLICY IF EXISTS profile_contacts_admin_all ON public.profile_contacts;
CREATE POLICY profile_contacts_admin_all ON public.profile_contacts FOR ALL TO authenticated
    USING (public.integrity_is_admin()) WITH CHECK (public.integrity_is_admin());

REVOKE ALL ON public.profile_contacts FROM anon;
GRANT SELECT ON public.profile_contacts TO authenticated;

-- ย้ายข้อมูลเดิม
INSERT INTO public.profile_contacts (user_id, email, phone)
SELECT id, email, phone FROM public.profiles
WHERE email IS NOT NULL OR phone IS NOT NULL
ON CONFLICT (user_id) DO UPDATE
    SET email = COALESCE(EXCLUDED.email, profile_contacts.email),
        phone = COALESCE(EXCLUDED.phone, profile_contacts.phone),
        updated_at = now();

-- trigger: ทุกครั้งที่มีการเขียน email/phone ลง profiles → ย้ายไป profile_contacts
-- (ใช้ AFTER สำหรับบันทึก contact เพราะต้องรอแถว profiles มีอยู่ก่อน FK)
CREATE OR REPLACE FUNCTION public.profiles_strip_contacts()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    IF NEW.email IS NOT NULL OR NEW.phone IS NOT NULL THEN
        INSERT INTO public.profile_contacts (user_id, email, phone)
        VALUES (NEW.id, NEW.email, NEW.phone)
        ON CONFLICT (user_id) DO UPDATE
            SET email = COALESCE(EXCLUDED.email, profile_contacts.email),
                phone = COALESCE(EXCLUDED.phone, profile_contacts.phone),
                updated_at = now();
        UPDATE public.profiles SET email = NULL, phone = NULL WHERE id = NEW.id;
    END IF;
    RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS zz_profiles_strip_contacts ON public.profiles;
CREATE TRIGGER zz_profiles_strip_contacts
    AFTER INSERT OR UPDATE OF email, phone ON public.profiles
    FOR EACH ROW
    WHEN (NEW.email IS NOT NULL OR NEW.phone IS NOT NULL)
    EXECUTE FUNCTION public.profiles_strip_contacts();

-- ล้างข้อมูลเดิมใน profiles
UPDATE public.profiles SET email = NULL, phone = NULL
WHERE email IS NOT NULL OR phone IS NOT NULL;

COMMIT;

-- ตรวจผล: ควรได้ profiles_with_contact = 0 และ contacts = จำนวนสมาชิกที่มีอีเมล/เบอร์
SELECT
    (SELECT count(*) FROM public.profiles WHERE email IS NOT NULL OR phone IS NOT NULL) AS profiles_with_contact,
    (SELECT count(*) FROM public.profile_contacts) AS contacts;
