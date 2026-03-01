-- ============================================================
-- 🏆 Leaderboard View
-- นำไปรันใน Supabase SQL Editor (SQL Editor > New Query)
-- ============================================================

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
  WHERE ep.payment_status = 'paid'   -- count only fully paid
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
WHERE COALESCE(ms.total_games, 0) > 0 OR COALESCE(s.total_spent, 0) > 0;
