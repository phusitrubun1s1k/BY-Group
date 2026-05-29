-- 🏸 Add payment_method column to event_players table
ALTER TABLE public.event_players 
ADD COLUMN IF NOT EXISTS payment_method TEXT CHECK (payment_method IN ('cash', 'transfer'));
