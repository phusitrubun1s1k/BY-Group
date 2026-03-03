-- ============================================================
-- 🏸 Guest Player & Public Board Support
-- ============================================================

-- 1. เพิ่มคอลัมน์ is_guest ใน profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS is_guest BOOLEAN DEFAULT false;

-- 2. ปรับให้ email เป็น nullable (เพราะขาจรไม่มีอีเมล)
ALTER TABLE public.profiles 
ALTER COLUMN email DROP NOT NULL;

-- 3. ปลดล็อก Foreign Key (เพื่อให้สร้าง Profile โดยไม่มี Auth User ได้)
-- หมายเหตุ: ชื่อ constraint อาจต่างกันไปตามการ setup ครั้งแรก 
-- โดยส่วนใหญ่จะเป็น 'profiles_id_fkey'
ALTER TABLE public.profiles 
DROP CONSTRAINT IF EXISTS profiles_id_fkey;

-- 4. เปิดสิทธิ์ให้แก้ไข Profiles ได้ (ในกรณีที่เป็นแอดมิน)
-- ปกติเรามี RLS ที่เช็ค auth.uid() = id อยู่แล้ว
-- เราต้องเพิ่มสิทธิ์ให้ Admin สามารถจัดการก๊วน/สร้างขาจรได้
CREATE POLICY "Admins can manage all profiles"
  ON public.profiles FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- 5. แก้ไข View Leaderboard ให้ไม่นับรวมขาจร
CREATE OR REPLACE VIEW view_leaderboard AS
WITH match_stats AS (
  SELECT 
    mp.user_id,
    COUNT(*) as total_games,
    SUM(CASE 
      WHEN (mp.team = 'A' AND m.team_a_score > m.team_b_score) 
        OR (mp.team = 'B' AND m.team_b_score > m.team_a_score) 
      THEN 1 ELSE 0 
    END) as total_wins,
    SUM(CASE 
      WHEN (mp.team = 'A' AND m.team_a_score < m.team_b_score) 
        OR (mp.team = 'B' AND m.team_b_score < m.team_a_score) 
      THEN 1 ELSE 0 
    END) as total_losses,
    SUM(CASE WHEN mp.team = 'A' THEN m.team_a_score ELSE m.team_b_score END) as total_points
  FROM match_players mp
  JOIN matches m ON m.id = mp.match_id
  WHERE m.status = 'finished'
  GROUP BY mp.user_id
),
shuttlecocks_per_event AS (
  SELECT
    mp.user_id,
    m.event_id,
    SUM(
      CASE 
        WHEN jsonb_typeof(m.shuttlecock_numbers) = 'array' 
        THEN (
          SELECT count(*) 
          FROM jsonb_array_elements_text(m.shuttlecock_numbers) AS t 
          WHERE t <> ''
        )
        ELSE 0 
      END
    ) as shuttlecock_count
  FROM match_players mp
  JOIN matches m ON m.id = mp.match_id
  WHERE m.status IN ('finished', 'playing')
  GROUP BY mp.user_id, m.event_id
),
spending AS (
  SELECT 
    ep.user_id,
    SUM(
      e.entry_fee + (e.shuttlecock_price * COALESCE(spe.shuttlecock_count, 0))
    ) as total_spent
  FROM event_players ep
  JOIN events e ON e.id = ep.event_id
  LEFT JOIN shuttlecocks_per_event spe ON spe.user_id = ep.user_id AND spe.event_id = ep.event_id
  WHERE ep.payment_status = 'paid'
  GROUP BY ep.user_id
)
SELECT 
  p.id as user_id,
  p.display_name,
  p.skill_level,
  COALESCE(ms.total_games, 0)::int as total_games,
  COALESCE(ms.total_wins, 0)::int as total_wins,
  COALESCE(ms.total_losses, 0)::int as total_losses,
  COALESCE(ms.total_points, 0)::bigint as total_points,
  COALESCE(s.total_spent, 0)::numeric as total_spent
FROM profiles p
LEFT JOIN match_stats ms ON ms.user_id = p.id
LEFT JOIN spending s ON s.user_id = p.id
WHERE (COALESCE(ms.total_games, 0) > 0 OR COALESCE(s.total_spent, 0) > 0)
  AND p.is_guest = false; -- <--- เพิ่มเงื่อนไขกรองขาจรออก
