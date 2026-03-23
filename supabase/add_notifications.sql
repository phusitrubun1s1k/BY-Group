-- ============================================================
-- 🏸 Notifications System Setup
-- ============================================================

-- 1. Create Notifications Table
CREATE TABLE public.notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  type text NOT NULL CHECK (type IN ('match_start', 'payment_reminder', 'achievement', 'system')),
  is_read boolean NOT NULL DEFAULT false,
  link_url text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT notifications_pkey PRIMARY KEY (id),
  CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE
);

-- 2. Enable Row Level Security
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT USING (true); -- Relaxed to true and let application fetch by user_id for simplicity or strict auth.uid()
-- Let's make it secure:
DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (id = user_id OR role = 'admin')));

CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Admins can insert notifications"
  ON public.notifications FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') OR auth.uid() = user_id
  );

-- 3. Enable Realtime for Notifications Table
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- 4. Create Match Start Trigger Function
CREATE OR REPLACE FUNCTION public.fn_notify_match_start()
RETURNS TRIGGER AS $$
DECLARE
    team_a_ids UUID[];
    team_b_ids UUID[];
    p_id UUID;
    v_court TEXT;
BEGIN
    -- If match is starting (changed from something else to 'playing')
    IF (OLD.status <> 'playing' AND NEW.status = 'playing') THEN
        v_court := NEW.court_number;
        
        -- Get players
        SELECT array_agg(user_id) INTO team_a_ids FROM match_players WHERE match_id = NEW.id AND team = 'A';
        SELECT array_agg(user_id) INTO team_b_ids FROM match_players WHERE match_id = NEW.id AND team = 'B';
        
        -- Notify Team A
        IF team_a_ids IS NOT NULL THEN
            FOREACH p_id IN ARRAY team_a_ids LOOP
                -- Don't notify guests as they don't log in
                IF EXISTS (SELECT 1 FROM profiles WHERE id = p_id AND is_guest = false) THEN
                    INSERT INTO notifications (user_id, title, body, type, link_url)
                    VALUES (p_id, 'ได้เวลาลงสนามแล้ว! 🏸', 'แมตช์ของคุณกำลังจะเริ่มที่ คอร์ท ' || v_court || ' เตรียมตัวลงสนามได้เลย!', 'match_start', '/dashboard/live');
                END IF;
            END LOOP;
        END IF;

        -- Notify Team B
        IF team_b_ids IS NOT NULL THEN
            FOREACH p_id IN ARRAY team_b_ids LOOP
                -- Don't notify guests
                IF EXISTS (SELECT 1 FROM profiles WHERE id = p_id AND is_guest = false) THEN
                    INSERT INTO notifications (user_id, title, body, type, link_url)
                    VALUES (p_id, 'ได้เวลาลงสนามแล้ว! 🏸', 'แมตช์ของคุณกำลังจะเริ่มที่ คอร์ท ' || v_court || ' เตรียมตัวลงสนามได้เลย!', 'match_start', '/dashboard/live');
                END IF;
            END LOOP;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Attach Trigger to matches Table
DROP TRIGGER IF EXISTS tr_after_match_start ON public.matches;
CREATE TRIGGER tr_after_match_start
AFTER UPDATE ON public.matches
FOR EACH ROW
EXECUTE FUNCTION public.fn_notify_match_start();
