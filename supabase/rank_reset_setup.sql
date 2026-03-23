-- ============================================================
-- 🔄 Rank Reset System Setup
-- ============================================================

-- 1. Schedule table
CREATE TABLE IF NOT EXISTS public.rank_reset_schedule (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reset_at TIMESTAMPTZ NOT NULL,
    created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'executed', 'cancelled')),
    season_label TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.rank_reset_schedule ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rank_reset_schedule_select" ON public.rank_reset_schedule FOR SELECT USING (true);
CREATE POLICY "rank_reset_schedule_insert" ON public.rank_reset_schedule FOR INSERT WITH CHECK (true);
CREATE POLICY "rank_reset_schedule_update" ON public.rank_reset_schedule FOR UPDATE USING (true);

-- 2. Season history table
CREATE TABLE IF NOT EXISTS public.season_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reset_id UUID NOT NULL REFERENCES public.rank_reset_schedule(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    season_label TEXT NOT NULL,
    final_mmr INT NOT NULL,
    final_rank_name TEXT NOT NULL,
    total_games INT DEFAULT 0,
    total_wins INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.season_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "season_history_select" ON public.season_history FOR SELECT USING (true);
CREATE POLICY "season_history_insert" ON public.season_history FOR INSERT WITH CHECK (true);
