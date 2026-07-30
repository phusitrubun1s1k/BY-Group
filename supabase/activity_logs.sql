-- ============================================================
-- 🏸 Activity Logs — บันทึกกิจกรรมในระบบ (Audit Log)
-- รันไฟล์นี้ใน Supabase SQL Editor เพื่อสร้างตารางเก็บ Log
-- หมวด: match (จัดการแมตช์) | payment (การเงิน) | player (ผู้เล่น) | rank (แรงค์/MMR)
-- ============================================================

CREATE TABLE IF NOT EXISTS activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- ผู้ทำรายการ (เก็บชื่อแยกไว้ด้วย เผื่อ profile ถูกลบภายหลัง log จะยังอ่านได้)
  actor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  actor_name TEXT,
  -- หมวดหมู่ของกิจกรรม (ใช้แยกแถบในหน้า admin)
  category TEXT NOT NULL CHECK (category IN ('match', 'payment', 'player', 'rank')),
  -- รหัสการกระทำแบบเครื่องอ่าน เช่น 'match.create', 'payment.confirm'
  action TEXT NOT NULL,
  -- ข้อความอ่านง่ายภาษาไทย
  description TEXT NOT NULL,
  -- อ้างอิงเป้าหมาย (ไว้กดดูต่อ/กรอง)
  target_type TEXT,
  target_id UUID,
  event_id UUID,
  -- ข้อมูลเพิ่มเติมแบบยืดหยุ่น (เก็บก่อน/หลัง, จำนวนเงิน, หมายเลขลูก ฯลฯ)
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index สำหรับกรองตามหมวดและเรียงตามเวลา
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_category ON activity_logs (category, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_event ON activity_logs (event_id);

-- ============================================================
-- RLS — เฉพาะ admin เท่านั้นที่อ่าน/เขียน Log ได้
-- ============================================================
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view activity logs" ON activity_logs;
CREATE POLICY "Admins can view activity logs"
  ON activity_logs FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "Admins can insert activity logs" ON activity_logs;
CREATE POLICY "Admins can insert activity logs"
  ON activity_logs FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ============================================================
-- Realtime — เปิดให้หน้า Log อัปเดตสด (เฉพาะ admin จะได้รับ event ตาม RLS)
-- ใช้ DO block เพื่อให้รันซ้ำได้โดยไม่ error ถ้าตารางถูกเพิ่มไปแล้ว
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'activity_logs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE activity_logs;
  END IF;
END $$;
