-- ============================================================
-- 🏸 View — MMR History (Rating Changes with Match Details)
-- ============================================================
CREATE OR REPLACE VIEW public.view_mmr_history AS
SELECT 
    mh.id as history_id,
    mh.user_id,
    mh.match_id,
    mh.old_mmr,
    mh.new_mmr,
    mh.change,
    mh.reason,
    mh.created_at as change_date,
    m.team_a_score,
    m.team_b_score,
    m.court_number,
    e.event_name,
    e.event_date,
    -- Simple logic to determine if the user's team won
    CASE 
        WHEN mh.change > 0 THEN 'Win'
        WHEN mh.change < 0 THEN 'Loss'
        ELSE 'Draw'
    END as result
FROM public.mmr_history mh
LEFT JOIN public.matches m ON m.id = mh.match_id
LEFT JOIN public.events e ON e.id = m.event_id;
