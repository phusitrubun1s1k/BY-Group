-- =====================================================================
-- เปิด Row Level Security (RLS) ให้ทุกตารางใน public
-- แก้ปัญหา Supabase Advisor: "RLS Disabled in Public" / "Policy Exists RLS Disabled"
--
-- หลักการ (ตรงกับที่แอปใช้อยู่จริง):
--   * อ่าน: ผู้ใช้ที่ login แล้วอ่านได้ (leaderboard / live / history ต้องเห็นข้อมูลคนอื่น)
--   * เขียน: แอดมินเท่านั้น ยกเว้น
--       - profiles: ผู้ใช้สร้าง/แก้โปรไฟล์ตัวเองได้ (trigger integrity_protect_profile กันแก้ role/mmr อยู่แล้ว)
--       - event_players: ผู้ใช้แก้แถวของตัวเองได้ (trigger integrity_protect_payment จำกัดให้แก้แค่ slip_url)
--   * ฟังก์ชัน SECURITY DEFINER (save_match, finish_match, record_player_payment ฯลฯ) ไม่ติด RLS
--   * view ที่หน้าแรกใช้ (view_leaderboard) ยังทำงานเหมือนเดิม
-- รันซ้ำได้ปลอดภัย (idempotent)
-- =====================================================================

-- ---------- profiles ----------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_read ON public.profiles;
CREATE POLICY profiles_read ON public.profiles FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS profiles_insert_own ON public.profiles;
CREATE POLICY profiles_insert_own ON public.profiles FOR INSERT TO authenticated
    WITH CHECK (id = (SELECT auth.uid()));

DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE TO authenticated
    USING (id = (SELECT auth.uid())) WITH CHECK (id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Admins can manage all profiles" ON public.profiles;
CREATE POLICY "Admins can manage all profiles" ON public.profiles FOR ALL TO authenticated
    USING (public.integrity_is_admin()) WITH CHECK (public.integrity_is_admin());

-- ---------- event_players ----------
ALTER TABLE public.event_players ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS event_players_read ON public.event_players;
CREATE POLICY event_players_read ON public.event_players FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS event_players_update_own ON public.event_players;
CREATE POLICY event_players_update_own ON public.event_players FOR UPDATE TO authenticated
    USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS event_players_admin_all ON public.event_players;
CREATE POLICY event_players_admin_all ON public.event_players FOR ALL TO authenticated
    USING (public.integrity_is_admin()) WITH CHECK (public.integrity_is_admin());

-- ---------- events / matches / match_players ----------
DO $$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['events', 'matches', 'match_players'] LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_read', t);
        EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)', t || '_read', t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_admin_all', t);
        EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.integrity_is_admin()) WITH CHECK (public.integrity_is_admin())', t || '_admin_all', t);
    END LOOP;
END $$;

-- ---------- ตารางอื่น ๆ ใน public ที่ยังไม่เปิด RLS ----------
-- เปิด RLS ให้ และถ้ายังไม่มี policy เลย ให้: login แล้วอ่านได้ + แอดมินจัดการได้
-- (ตารางที่มี policy อยู่แล้ว เช่น notifications, activity_logs จะเปิด RLS อย่างเดียว ไม่แตะ policy เดิม)
DO $$
DECLARE r record;
BEGIN
    FOR r IN
        SELECT c.relname
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.relname);
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = r.relname) THEN
            EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)', r.relname || '_read', r.relname);
            EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.integrity_is_admin()) WITH CHECK (public.integrity_is_admin())', r.relname || '_admin_all', r.relname);
        END IF;
        -- มี policy อยู่แล้วแต่ไม่มีสิทธิ์อ่าน (เช่น rank_reset_schedule ที่มีแค่ insert/update) → เพิ่มสิทธิ์อ่าน
        -- ยกเว้นตารางข้อมูลส่วนตัว/แอดมินที่ตั้งใจจำกัดการอ่านไว้แล้ว
        IF r.relname NOT IN ('notifications', 'activity_logs', 'player_payments')
           AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = r.relname AND cmd IN ('SELECT', 'ALL')) THEN
            EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)', r.relname || '_read', r.relname);
        END IF;
        RAISE NOTICE 'Enabled RLS on public.%', r.relname;
    END LOOP;
END $$;

-- ตรวจผล: ควรได้ 0 แถว
SELECT c.relname AS table_without_rls
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;
