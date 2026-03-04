-- ============================================================
-- 🏸 MMR (Elo) System Setup
-- ============================================================

-- 1. Add MMR column to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS mmr INT DEFAULT 1000;

-- Set default MMR for existing profiles
UPDATE public.profiles SET mmr = 1000 WHERE mmr IS NULL;

-- 2. Create MMR History table
CREATE TABLE IF NOT EXISTS public.mmr_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    match_id UUID REFERENCES public.matches(id) ON DELETE CASCADE,
    old_mmr INT NOT NULL,
    new_mmr INT NOT NULL,
    change INT NOT NULL,
    reason TEXT, -- e.g., 'match_result', 'admin_adjustment'
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS for history
ALTER TABLE public.mmr_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "MMR history is viewable by everyone" ON public.mmr_history FOR SELECT USING (true);

-- 3. Function to calculate and update MMR after a match
CREATE OR REPLACE FUNCTION public.fn_calculate_match_mmr()
RETURNS TRIGGER AS $$
DECLARE
    team_a_ids UUID[];
    team_b_ids UUID[];
    team_a_avg FLOAT;
    team_b_avg FLOAT;
    expected_a FLOAT;
    expected_b FLOAT;
    k_factor INT := 64;
    actual_a FLOAT;
    actual_b FLOAT;
    p_id UUID;
    old_r INT;
    new_r INT;
    diff INT;
BEGIN
    -- Only run when status changes to 'finished'
    IF (OLD.status <> 'finished' AND NEW.status = 'finished') THEN
        -- Get players for Team A
        SELECT array_agg(user_id) INTO team_a_ids FROM match_players WHERE match_id = NEW.id AND team = 'A';
        -- Get players for Team B
        SELECT array_agg(user_id) INTO team_b_ids FROM match_players WHERE match_id = NEW.id AND team = 'B';

        -- Calculate Average MMR for teams
        SELECT AVG(mmr) INTO team_a_avg FROM profiles WHERE id = ANY(team_a_ids);
        SELECT AVG(mmr) INTO team_b_avg FROM profiles WHERE id = ANY(team_b_ids);

        -- Elo Formula: Expected Score
        expected_a := 1.0 / (1.0 + pow(10, (team_b_avg - team_a_avg) / 400.0));
        expected_b := 1.0 - expected_a;

        -- Actual Result
        IF NEW.team_a_score > NEW.team_b_score THEN
            actual_a := 1.0;
            actual_b := 0.0;
        ELSIF NEW.team_b_score > NEW.team_a_score THEN
            actual_a := 0.0;
            actual_b := 1.0;
        ELSE
            -- Draw (if possible in your system)
            actual_a := 0.5;
            actual_b := 0.5;
        END IF;

        -- Update Team A Players
        FOREACH p_id IN ARRAY team_a_ids LOOP
            SELECT mmr INTO old_r FROM profiles WHERE id = p_id;
            diff := round(k_factor * (actual_a - expected_a));
            new_r := old_r + diff;
            
            UPDATE profiles SET mmr = new_r WHERE id = p_id;
            INSERT INTO mmr_history (user_id, match_id, old_mmr, new_mmr, change, reason)
            VALUES (p_id, NEW.id, old_r, new_r, diff, 'match_result');
        END LOOP;

        -- Update Team B Players
        FOREACH p_id IN ARRAY team_b_ids LOOP
            SELECT mmr INTO old_r FROM profiles WHERE id = p_id;
            diff := round(k_factor * (actual_b - expected_b));
            new_r := old_r + diff;
            
            UPDATE profiles SET mmr = new_r WHERE id = p_id;
            INSERT INTO mmr_history (user_id, match_id, old_mmr, new_mmr, change, reason)
            VALUES (p_id, NEW.id, old_r, new_r, diff, 'match_result');
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Create Trigger
DROP TRIGGER IF EXISTS tr_after_match_finished ON public.matches;
CREATE TRIGGER tr_after_match_finished
AFTER UPDATE ON public.matches
FOR EACH ROW
EXECUTE FUNCTION public.fn_calculate_match_mmr();
