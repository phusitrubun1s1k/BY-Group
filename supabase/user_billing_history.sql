-- ============================================================
-- 🧾 User Billing History View
-- นำไปรันใน Supabase SQL Editor (SQL Editor > New Query)
-- สำหรับหน้าโปรไฟล์ แสดงรายการที่เล่นและยอดเงิน
-- ============================================================

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
