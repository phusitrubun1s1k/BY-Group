-- ============================================================
-- 🏅 Achievements & Badges View
-- นำไปรันใน Supabase SQL Editor (SQL Editor > New Query)
-- ============================================================

CREATE OR REPLACE VIEW view_user_badges AS
WITH user_match_results AS (
  SELECT 
    mp.user_id,
    m.id as match_id,
    m.created_at,
    CASE 
      WHEN (mp.team = 'A' AND m.team_a_score > m.team_b_score) 
        OR (mp.team = 'B' AND m.team_b_score > m.team_a_score) 
      THEN 1 ELSE 0 
    END as is_win,
    ROW_NUMBER() OVER(PARTITION BY mp.user_id ORDER BY m.created_at DESC) as match_rank
  FROM match_players mp
  JOIN matches m ON m.id = mp.match_id
  WHERE m.status = 'finished'
),
win_streaks AS (
  SELECT 
    user_id,
    -- Check if last 3 matches were wins
    (MIN(is_win) FILTER (WHERE match_rank <= 3) = 1 AND COUNT(*) >= 3) as has_win_streak_3
  FROM user_match_results
  GROUP BY user_id
),
shuttlecock_counts AS (
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
    ) as shuttle_count
  FROM match_players mp
  JOIN matches m ON m.id = mp.match_id
  WHERE m.status IN ('finished', 'playing')
  GROUP BY mp.user_id, m.event_id
),
weekly_spending AS (
  SELECT 
    ep.user_id,
    SUM(e.entry_fee + (e.shuttlecock_price * COALESCE(sc.shuttle_count, 0))) as weekly_spent
  FROM event_players ep
  JOIN events e ON e.id = ep.event_id
  LEFT JOIN shuttlecock_counts sc ON sc.user_id = ep.user_id AND sc.event_id = ep.event_id
  WHERE e.event_date >= CURRENT_DATE - INTERVAL '7 days'
    AND ep.payment_status = 'paid'
  GROUP BY ep.user_id
),
patron_rank AS (
  SELECT 
    user_id,
    weekly_spent,
    RANK() OVER(ORDER BY weekly_spent DESC) as spending_rank
  FROM weekly_spending
),
overall_stats AS (
  SELECT 
    mp.user_id,
    COUNT(*) as total_games
  FROM match_players mp
  JOIN matches m ON m.id = mp.match_id
  WHERE m.status = 'finished'
  GROUP BY mp.user_id
)
SELECT 
  p.id as user_id,
  COALESCE(ws.has_win_streak_3, false) as badge_win_streak,
  (COALESCE(os.total_games, 0) >= 100) as badge_marathon,
  (COALESCE(pr.spending_rank, 0) = 1 AND COALESCE(pr.weekly_spent, 0) > 0) as badge_patron
FROM profiles p
LEFT JOIN win_streaks ws ON ws.user_id = p.id
LEFT JOIN overall_stats os ON os.user_id = p.id
LEFT JOIN patron_rank pr ON pr.user_id = p.id;
