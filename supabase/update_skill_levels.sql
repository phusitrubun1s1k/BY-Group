-- ============================================================
-- Migration: อัปเดตระดับฝีมือเป็นระบบใหม่
-- รันใน Supabase SQL Editor
-- ============================================================

-- ลบ CHECK constraint เก่า
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_skill_level_check;

-- เพิ่ม CHECK constraint ใหม่ รองรับทุกระดับ
ALTER TABLE profiles ADD CONSTRAINT profiles_skill_level_check
  CHECK (skill_level IN (
    'เปาะแปะ', 'BG', 'N', 'S',
    'P-', 'P', 'P+',
    'C', 'B', 'A'
  ));
