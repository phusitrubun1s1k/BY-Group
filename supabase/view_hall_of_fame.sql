-- ============================================================
-- 🏸 View — Season Hall of Fame (Top 3 of Each Month)
-- ============================================================
CREATE OR REPLACE VIEW public.view_hall_of_fame AS
WITH ranked_monthly AS (
    SELECT 
        month_key,
        user_id,
        display_name,
        skill_level,
        mmr,
        total_games,
        total_wins,
        total_points,
        total_spent,
        ROW_NUMBER() OVER (PARTITION BY month_key ORDER BY mmr DESC, total_wins DESC, total_points DESC) as rank_position
    FROM public.view_monthly_leaderboard
)
SELECT 
    month_key,
    user_id,
    display_name,
    skill_level,
    mmr,
    total_games,
    total_wins,
    total_points,
    total_spent,
    rank_position
FROM ranked_monthly
WHERE rank_position <= 3
ORDER BY month_key DESC, rank_position ASC;
