-- ============================================================
-- 🛠 FIX: Missing Views & Schema Inconsistencies
-- รันไฟล์นี้ใน Supabase SQL Editor เพื่อแก้ปัญหา Error 400/406
-- ============================================================

-- 1. เพิ่มคอลัมน์ที่อาจจะขาดหายไปในตาราง events
ALTER TABLE events ADD COLUMN IF NOT EXISTS event_name TEXT DEFAULT '';

-- 2. VIEW: view_billing_summary (ใช้ในหน้า Dashboard และ Profile เพื่อคำนวณยอดเงิน)
CREATE OR REPLACE VIEW view_billing_summary AS
WITH shuttlecocks_per_event AS (
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
event_games AS (
  SELECT
    mp.user_id,
    m.event_id,
    COUNT(*) as games_played
  FROM match_players mp
  JOIN matches m ON m.id = mp.match_id
  WHERE m.status IN ('finished', 'playing')
  GROUP BY mp.user_id, m.event_id
)
SELECT 
  ep.user_id,
  e.id as event_id,
  e.event_date,
  ep.id as event_player_id,
  ep.payment_status,
  ep.slip_url,
  COALESCE(eg.games_played, 0)::int as total_games,
  COALESCE(spe.shuttlecock_count, 0)::int as total_shuttlecocks,
  (e.entry_fee + (e.shuttlecock_price * COALESCE(spe.shuttlecock_count, 0)))::numeric as total_cost,
  -- compatible aliases
  (e.entry_fee + (e.shuttlecock_price * COALESCE(spe.shuttlecock_count, 0)))::numeric as total_amount,
  (e.entry_fee + (e.shuttlecock_price * COALESCE(spe.shuttlecock_count, 0)))::numeric as amount,
  (e.entry_fee + (e.shuttlecock_price * COALESCE(spe.shuttlecock_count, 0)))::numeric as cost
FROM event_players ep
JOIN events e ON e.id = ep.event_id
LEFT JOIN shuttlecocks_per_event spe ON spe.user_id = ep.user_id AND spe.event_id = ep.event_id
LEFT JOIN event_games eg ON eg.user_id = ep.user_id AND eg.event_id = ep.event_id;

-- 3. VIEW: view_monthly_leaderboard (ใช้ในหน้า Leaderboard สำหรับกรองรายเดือน)
CREATE OR REPLACE VIEW view_monthly_leaderboard AS
WITH match_stats AS (
  SELECT 
    mp.user_id,
    to_char(e.event_date, 'YYYY-MM') as month_key,
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
  JOIN events e ON e.id = m.event_id
  WHERE m.status = 'finished'
  GROUP BY mp.user_id, to_char(e.event_date, 'YYYY-MM')
),
shuttlecocks_per_month AS (
  SELECT
    mp.user_id,
    to_char(e.event_date, 'YYYY-MM') as month_key,
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
  JOIN events e ON e.id = m.event_id
  WHERE m.status IN ('finished', 'playing')
  GROUP BY mp.user_id, to_char(e.event_date, 'YYYY-MM')
),
monthly_spending AS (
  SELECT 
    ep.user_id,
    to_char(e.event_date, 'YYYY-MM') as month_key,
    SUM(
      e.entry_fee + (e.shuttlecock_price * COALESCE(spm.shuttlecock_count, 0))
    ) as total_spent
  FROM event_players ep
  JOIN events e ON e.id = ep.event_id
  LEFT JOIN shuttlecocks_per_month spm ON spm.user_id = ep.user_id AND spm.month_key = to_char(e.event_date, 'YYYY-MM')
  WHERE ep.payment_status = 'paid'
  GROUP BY ep.user_id, to_char(e.event_date, 'YYYY-MM')
)
SELECT 
  p.id as user_id,
  ms.month_key,
  p.display_name,
  p.skill_level,
  COALESCE(ms.total_games, 0)::int as total_games,
  COALESCE(ms.total_wins, 0)::int as total_wins,
  COALESCE(ms.total_losses, 0)::int as total_losses,
  COALESCE(ms.total_points, 0)::bigint as total_points,
  COALESCE(s.total_spent, 0)::numeric as total_spent
FROM profiles p
JOIN match_stats ms ON ms.user_id = p.id
LEFT JOIN monthly_spending s ON s.user_id = p.id AND s.month_key = ms.month_key;

-- 4. อัปเดต view_user_billing_history (ใช้คอลัมน์ event_name ที่เพิ่มใหม่)
CREATE OR REPLACE VIEW view_user_billing_history AS
WITH shuttlecocks_per_event AS (
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
event_games AS (
  SELECT
    mp.user_id,
    m.event_id,
    COUNT(*) as games_played
  FROM match_players mp
  JOIN matches m ON m.id = mp.match_id
  WHERE m.status IN ('finished', 'playing')
  GROUP BY mp.user_id, m.event_id
)
SELECT 
  ep.user_id,
  e.id as event_id,
  e.event_name,
  e.event_date,
  e.entry_fee,
  e.shuttlecock_price,
  COALESCE(spe.shuttlecock_count, 0)::int as shuttlecock_count,
  COALESCE(eg.games_played, 0)::int as games_played,
  ep.payment_status,
  (e.entry_fee + (e.shuttlecock_price * COALESCE(spe.shuttlecock_count, 0)))::numeric as total_amount
FROM event_players ep
JOIN events e ON e.id = ep.event_id
LEFT JOIN shuttlecocks_per_event spe ON spe.user_id = ep.user_id AND spe.event_id = ep.event_id
LEFT JOIN event_games eg ON eg.user_id = ep.user_id AND eg.event_id = ep.event_id;

-- ❗ ข้อแนะนำ: หลังจากรัน SQL นี้แล้ว ให้ไปที่ Supabase Dashboard > API
-- และตรวจสอบว่าเห็น Views เหล่านี้ในรายการหรือไม่ หากยังเห็น Error 406 
-- อาจต้องรอสักครู่เพื่อให้ PostgREST อัปเดต Schema Cache
