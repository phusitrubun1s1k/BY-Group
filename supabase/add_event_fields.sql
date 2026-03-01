-- ============================================================
-- 🏸 Migration: เพิ่มฟิลด์ courts, start_time, end_time ใน events
-- รันใน Supabase SQL Editor
-- ============================================================

-- เพิ่มคอร์ทที่ใช้ (เก็บเป็น array เช่น ["1","2","3"])
ALTER TABLE events ADD COLUMN IF NOT EXISTS courts TEXT[] DEFAULT '{}';

-- เพิ่มเวลาเริ่มต้นและสิ้นสุด
ALTER TABLE events ADD COLUMN IF NOT EXISTS start_time TEXT DEFAULT '19:00';
ALTER TABLE events ADD COLUMN IF NOT EXISTS end_time TEXT DEFAULT '23:00';
