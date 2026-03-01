-- ============================================================
-- 🏸 Badminton Group — Full Database Setup
-- Copy ทั้งหมดไปรันใน Supabase SQL Editor
-- ============================================================

-- ============================================================
-- 1. PROFILES TABLE (เชื่อมกับ Supabase Auth)
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  phone TEXT,
  skill_level TEXT CHECK (skill_level IN ('Beginner', 'Intermediate', 'Advanced')),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public profiles are viewable by everyone"
  ON profiles FOR SELECT USING (true);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- ============================================================
-- 2. EVENTS TABLE (ก๊วน/อีเวนต์)
-- ============================================================
CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_date DATE NOT NULL,
  shuttlecock_brand TEXT NOT NULL DEFAULT '',
  shuttlecock_price NUMERIC NOT NULL DEFAULT 0,
  entry_fee NUMERIC NOT NULL DEFAULT 0,
  event_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Events are viewable by everyone"
  ON events FOR SELECT USING (true);

CREATE POLICY "Admins can insert events"
  ON events FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can update events"
  ON events FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ============================================================
-- 3. EVENT_PLAYERS TABLE (เช็คอินผู้เล่น + การจ่ายเงิน)
-- ============================================================
CREATE TABLE IF NOT EXISTS event_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid')),
  slip_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(event_id, user_id)
);

ALTER TABLE event_players ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Event players are viewable by everyone"
  ON event_players FOR SELECT USING (true);

CREATE POLICY "Admins can manage event players"
  ON event_players FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can update event players"
  ON event_players FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can delete event players"
  ON event_players FOR DELETE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Users can update own payment"
  ON event_players FOR UPDATE USING (auth.uid() = user_id);

-- ============================================================
-- 4. MATCHES TABLE (แมตช์)
-- ============================================================
CREATE TABLE IF NOT EXISTS matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  court_number TEXT NOT NULL DEFAULT '',
  shuttlecock_number TEXT,
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'playing', 'finished')),
  team_a_score INT NOT NULL DEFAULT 0,
  team_b_score INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Matches are viewable by everyone"
  ON matches FOR SELECT USING (true);

CREATE POLICY "Admins can insert matches"
  ON matches FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can update matches"
  ON matches FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can delete matches"
  ON matches FOR DELETE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ============================================================
-- 5. MATCH_PLAYERS TABLE (ผู้เล่นในแต่ละแมตช์)
-- ============================================================
CREATE TABLE IF NOT EXISTS match_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  team TEXT NOT NULL CHECK (team IN ('A', 'B')),
  UNIQUE(match_id, user_id)
);

ALTER TABLE match_players ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Match players are viewable by everyone"
  ON match_players FOR SELECT USING (true);

CREATE POLICY "Admins can insert match players"
  ON match_players FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can update match players"
  ON match_players FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can delete match players"
  ON match_players FOR DELETE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ============================================================
-- 6. REALTIME — เปิดให้ตารางที่เกี่ยวข้องอัปเดต real-time
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE matches, event_players, match_players;

-- ============================================================
-- 7. VIEW — Leaderboard (จัดอันดับผู้เล่น)
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

-- ============================================================
-- 8. VIEW — Billing Summary (คำนวณยอดเงินรายวัน)
-- ============================================================
CREATE OR REPLACE VIEW view_billing_summary AS
WITH shuttlecocks_per_event AS (
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
event_games AS (
  SELECT
    mp.user_id,
    m.event_id,
    COUNT(*) as games_played
  FROM match_players mp
  JOIN matches m ON m.id = mp.match_id
  WHERE m.status IN ('finished', 'playing')
  GROUP BY mp.user_id, m.event_id
)
SELECT 
  ep.user_id,
  e.id as event_id,
  e.event_date,
  ep.id as event_player_id,
  ep.payment_status,
  ep.slip_url,
  COALESCE(eg.games_played, 0)::int as total_games,
  COALESCE(spe.shuttlecock_count, 0)::int as total_shuttlecocks,
  (e.entry_fee + (e.shuttlecock_price * COALESCE(spe.shuttlecock_count, 0)))::numeric as total_cost,
  (e.entry_fee + (e.shuttlecock_price * COALESCE(spe.shuttlecock_count, 0)))::numeric as total_amount,
  (e.entry_fee + (e.shuttlecock_price * COALESCE(spe.shuttlecock_count, 0)))::numeric as amount,
  (e.entry_fee + (e.shuttlecock_price * COALESCE(spe.shuttlecock_count, 0)))::numeric as cost
FROM event_players ep
JOIN events e ON e.id = ep.event_id
LEFT JOIN shuttlecocks_per_event spe ON spe.user_id = ep.user_id AND spe.event_id = ep.event_id
LEFT JOIN event_games eg ON eg.user_id = ep.user_id AND eg.event_id = ep.event_id;

-- ============================================================
-- 9. VIEW — Monthly Leaderboard (กรองรายเดือน)
-- ============================================================
CREATE OR REPLACE VIEW view_monthly_leaderboard AS
WITH match_stats AS (
  SELECT 
    mp.user_id,
    to_char(e.event_date, 'YYYY-MM') as month_key,
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
  JOIN events e ON e.id = m.event_id
  WHERE m.status = 'finished'
  GROUP BY mp.user_id, to_char(e.event_date, 'YYYY-MM')
),
shuttlecocks_per_month AS (
  SELECT
    mp.user_id,
    to_char(e.event_date, 'YYYY-MM') as month_key,
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
  JOIN events e ON e.id = m.event_id
  WHERE m.status IN ('finished', 'playing')
  GROUP BY mp.user_id, to_char(e.event_date, 'YYYY-MM')
),
monthly_spending AS (
  SELECT 
    ep.user_id,
    to_char(e.event_date, 'YYYY-MM') as month_key,
    SUM(
      e.entry_fee + (e.shuttlecock_price * COALESCE(spm.shuttlecock_count, 0))
    ) as total_spent
  FROM event_players ep
  JOIN events e ON e.id = ep.event_id
  LEFT JOIN shuttlecocks_per_month spm ON spm.user_id = ep.user_id AND spm.month_key = to_char(e.event_date, 'YYYY-MM')
  WHERE ep.payment_status = 'paid'
  GROUP BY ep.user_id, to_char(e.event_date, 'YYYY-MM')
)
SELECT 
  p.id as user_id,
  ms.month_key,
  p.display_name,
  p.skill_level,
  COALESCE(ms.total_games, 0)::int as total_games,
  COALESCE(ms.total_wins, 0)::int as total_wins,
  COALESCE(ms.total_losses, 0)::int as total_losses,
  COALESCE(ms.total_points, 0)::bigint as total_points,
  COALESCE(s.total_spent, 0)::numeric as total_spent
FROM profiles p
JOIN match_stats ms ON ms.user_id = p.id
LEFT JOIN monthly_spending s ON s.user_id = p.id AND s.month_key = ms.month_key;

-- ============================================================
-- 8. STORAGE BUCKET — สำหรับอัปโหลดสลิป
-- ============================================================
INSERT INTO storage.buckets (id, name, public) 
VALUES ('slips', 'slips', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Anyone can view slips"
  ON storage.objects FOR SELECT USING (bucket_id = 'slips');

CREATE POLICY "Authenticated users can upload slips"
  ON storage.objects FOR INSERT WITH CHECK (
    bucket_id = 'slips' AND auth.role() = 'authenticated'
  );
