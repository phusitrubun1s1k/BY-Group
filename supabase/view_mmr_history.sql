-- ============================================================
-- 🏸 View — MMR History (Rating Changes with Match Details)
-- ============================================================
-- Ensure event_name exists in events table to prevent missing column error
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS event_name TEXT NOT NULL DEFAULT '';

-- Drop view cascadingly to allow redefinition of columns (bypasses ERROR: 42P16)
DROP VIEW IF EXISTS public.view_mmr_history CASCADE;

CREATE VIEW public.view_mmr_history AS
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
LEFT JOIN public.events e ON e.id = COALESCE(
    m.event_id,
    CASE 
        WHEN mh.reason LIKE 'absence_penalty:%' THEN 
            CAST(SUBSTRING(mh.reason FROM 'absence_penalty:(.*)') AS UUID)
        ELSE NULL 
    END
);
