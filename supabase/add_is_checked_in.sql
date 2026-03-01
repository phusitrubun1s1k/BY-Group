-- ============================================================
-- 🏸 Migration: เพิ่มฟิลด์ is_checked_in ใน event_players
-- รันใน Supabase SQL Editor เพื่อใช้ตรวจสอบว่าผู้เล่นมาถึงหรือยัง
-- ============================================================

ALTER TABLE event_players ADD COLUMN IF NOT EXISTS is_checked_in BOOLEAN DEFAULT false;
