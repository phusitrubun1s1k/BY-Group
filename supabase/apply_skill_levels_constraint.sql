-- ============================================================
-- Migration: อัปเดตระเบียน Check Constraint ของระดับฝีมือในตาราง Profiles ให้รองรับระบบใหม่
-- ============================================================

-- ลบ CHECK constraint ตัวเก่าที่ใช้แค่ Beginner, Intermediate, Advanced
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_skill_level_check;

-- เพิ่ม CHECK constraint ตัวล่าสุด รองรับระดับฝีมือไทย
ALTER TABLE profiles ADD CONSTRAINT profiles_skill_level_check
  CHECK (skill_level = ANY (ARRAY['เปาะแปะ'::text, 'BG'::text, 'N'::text, 'S'::text, 'P-'::text, 'P'::text, 'P+'::text, 'C'::text, 'B'::text, 'A'::text]));
