-- ============================================================
-- 🛠 FIX: การคำนวณเงินผู้เล่น (ค่าลูก + ค่าเพิ่ม/ส่วนลด)
-- รันไฟล์นี้ใน Supabase SQL Editor (copy ทั้งไฟล์ -> Run ครั้งเดียวจบ)
-- ------------------------------------------------------------
-- คอลัมน์ matches.shuttlecock_numbers เป็น text[] (array) จึงใช้ unnest()
-- แก้ 2 อย่าง:
--   1) เกมที่เล่นแล้วนับค่าลูกอย่างน้อย 1 ลูก  -> GREATEST(1, count)
--   2) รวมค่าเพิ่ม (additional_cost) และหักส่วนลด (discount)
-- ใช้ DROP VIEW ก่อน CREATE เพราะเปลี่ยนโครง/ลำดับคอลัมน์ของ view เดิม
-- ============================================================

-- 0) เพิ่มคอลัมน์ event_name (ถ้ายังไม่มี) — view_user_billing_history ใช้คอลัมน์นี้
ALTER TABLE events ADD COLUMN IF NOT EXISTS event_name TEXT DEFAULT '';


-- ============================================================
-- 1) VIEW: view_billing_summary (ยอดวันนี้บนหน้า Dashboard / Profile)
-- ============================================================
DROP VIEW IF EXISTS view_billing_summary;
CREATE VIEW view_billing_summary AS
WITH shuttlecocks_per_event AS (
  SELECT
    mp.user_id,
    m.event_id,
    SUM(
      GREATEST(1, (SELECT count(*) FROM unnest(m.shuttlecock_numbers) AS t WHERE btrim(t) <> ''))
    ) as shuttlecock_count
  FROM match_players mp
  JOIN matches m ON m.id = mp.match_id
  WHERE m.status IN ('finished', 'playing')
  GROUP BY mp.user_id, m.event_id
),
event_games AS (
  SELECT mp.user_id, m.event_id, COUNT(*) as games_played
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
  (e.entry_fee + (e.shuttlecock_price * COALESCE(spe.shuttlecock_count, 0)) + COALESCE(ep.additional_cost, 0) - COALESCE(ep.discount, 0))::numeric as total_cost,
  (e.entry_fee + (e.shuttlecock_price * COALESCE(spe.shuttlecock_count, 0)) + COALESCE(ep.additional_cost, 0) - COALESCE(ep.discount, 0))::numeric as total_amount,
  (e.entry_fee + (e.shuttlecock_price * COALESCE(spe.shuttlecock_count, 0)) + COALESCE(ep.additional_cost, 0) - COALESCE(ep.discount, 0))::numeric as amount,
  (e.entry_fee + (e.shuttlecock_price * COALESCE(spe.shuttlecock_count, 0)) + COALESCE(ep.additional_cost, 0) - COALESCE(ep.discount, 0))::numeric as cost
FROM event_players ep
JOIN events e ON e.id = ep.event_id
LEFT JOIN shuttlecocks_per_event spe ON spe.user_id = ep.user_id AND spe.event_id = ep.event_id
LEFT JOIN event_games eg ON eg.user_id = ep.user_id AND eg.event_id = ep.event_id;


-- ============================================================
-- 2) VIEW: view_user_billing_history (ประวัติการชำระเงินของผู้เล่น)
-- ============================================================
DROP VIEW IF EXISTS view_user_billing_history;
CREATE VIEW view_user_billing_history AS
WITH shuttlecocks_per_event AS (
  SELECT
    mp.user_id,
    m.event_id,
    SUM(
      GREATEST(1, (SELECT count(*) FROM unnest(m.shuttlecock_numbers) AS t WHERE btrim(t) <> ''))
    ) as shuttlecock_count
  FROM match_players mp
  JOIN matches m ON m.id = mp.match_id
  WHERE m.status IN ('finished', 'playing')
  GROUP BY mp.user_id, m.event_id
),
event_games AS (
  SELECT mp.user_id, m.event_id, COUNT(*) as games_played
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
  (e.entry_fee + (e.shuttlecock_price * COALESCE(spe.shuttlecock_count, 0)) + COALESCE(ep.additional_cost, 0) - COALESCE(ep.discount, 0))::numeric as total_amount
FROM event_players ep
JOIN events e ON e.id = ep.event_id
LEFT JOIN shuttlecocks_per_event spe ON spe.user_id = ep.user_id AND spe.event_id = ep.event_id
LEFT JOIN event_games eg ON eg.user_id = ep.user_id AND eg.event_id = ep.event_id;


-- ============================================================
-- 3) VIEW: view_monthly_leaderboard (มี mmr, กรอง guest, ยอดใช้จ่ายรายเดือน)
--    ใช้ CASCADE เพราะ view_hall_of_fame พึ่งพาอยู่ -> สร้างคืนด้านล่าง (ข้อ 4)
-- ============================================================
DROP VIEW IF EXISTS view_monthly_leaderboard CASCADE;
CREATE VIEW view_monthly_leaderboard AS
WITH match_stats AS (
  SELECT
    mp.user_id,
    to_char(e.event_date, 'YYYY-MM') as month_key,
    COUNT(*) as total_games,
    SUM(CASE WHEN (mp.team = 'A' AND m.team_a_score > m.team_b_score)
              OR (mp.team = 'B' AND m.team_b_score > m.team_a_score) THEN 1 ELSE 0 END) as total_wins,
    SUM(CASE WHEN (mp.team = 'A' AND m.team_a_score < m.team_b_score)
              OR (mp.team = 'B' AND m.team_b_score < m.team_a_score) THEN 1 ELSE 0 END) as total_losses,
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
      GREATEST(1, (SELECT count(*) FROM unnest(m.shuttlecock_numbers) AS t WHERE btrim(t) <> ''))
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
        + COALESCE(ep.additional_cost, 0) - COALESCE(ep.discount, 0)
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
  p.mmr,
  COALESCE(ms.total_games, 0)::int as total_games,
  COALESCE(ms.total_wins, 0)::int as total_wins,
  COALESCE(ms.total_losses, 0)::int as total_losses,
  COALESCE(ms.total_points, 0)::bigint as total_points,
  COALESCE(s.total_spent, 0)::numeric as total_spent
FROM profiles p
JOIN match_stats ms ON ms.user_id = p.id
LEFT JOIN monthly_spending s ON s.user_id = p.id AND s.month_key = ms.month_key
WHERE p.is_guest = false;


-- ============================================================
-- 4) VIEW: view_hall_of_fame (สร้างคืนหลังโดน CASCADE ในข้อ 3)
-- ============================================================
CREATE VIEW public.view_hall_of_fame AS
WITH ranked_monthly AS (
    SELECT
        month_key, user_id, display_name, skill_level, mmr,
        total_games, total_wins, total_points, total_spent,
        ROW_NUMBER() OVER (PARTITION BY month_key ORDER BY mmr DESC, total_wins DESC, total_points DESC) as rank_position
    FROM public.view_monthly_leaderboard
)
SELECT
    month_key, user_id, display_name, skill_level, mmr,
    total_games, total_wins, total_points, total_spent, rank_position
FROM ranked_monthly
WHERE rank_position <= 3
ORDER BY month_key DESC, rank_position ASC;
