-- Add is_substitute column to event_players
ALTER TABLE public.event_players
ADD COLUMN IF NOT EXISTS is_substitute BOOLEAN DEFAULT false;
