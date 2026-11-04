-- =====================================================================
-- แก้ Supabase Advisor: "Security Definer View"
-- ให้ทุก view ใน public ทำงานด้วยสิทธิ์ของคนที่เรียก (security_invoker)
-- → view จะเคารพ RLS ของตารางต้นทาง (รันหลัง 20261104000000_enable_rls.sql)
--
-- หน้าแรก (ยังไม่ login) เดิมอ่าน view_leaderboard ตรง ๆ แบบ anon
-- หลังเปลี่ยนแล้ว anon จะอ่านตารางไม่ได้ จึงเพิ่มฟังก์ชัน get_home_leaderboard()
-- ที่ส่งกลับเฉพาะคอลัมน์สาธารณะ (ชื่อเล่น / ระดับ / จำนวนชนะ) ไม่มีเบอร์โทร อีเมล หรือข้อมูลการเงิน
-- รันซ้ำได้ปลอดภัย
-- =====================================================================

DO $$
DECLARE r record;
BEGIN
    FOR r IN
        SELECT c.relname
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'v'
    LOOP
        EXECUTE format('ALTER VIEW public.%I SET (security_invoker = true)', r.relname);
        RAISE NOTICE 'security_invoker on public.%', r.relname;
    END LOOP;
END $$;

-- ---------- อันดับสำหรับหน้าแรก (สาธารณะ) ----------
-- กรองแบบเดียวกับที่หน้าแรกเคยทำใน JS:
--   ต้องมีเกม > 0 และขาดก๊วนติดต่อกัน (นับจากก๊วนที่ปิดหลังรีแรงค์ล่าสุด) ไม่ถึง 3 ครั้ง
CREATE OR REPLACE FUNCTION public.get_home_leaderboard(p_limit integer DEFAULT 10)
RETURNS TABLE (user_id uuid, display_name text, skill_level text, total_wins bigint, total_games bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
    WITH reset AS (
        SELECT COALESCE(
            (SELECT reset_at FROM rank_reset_schedule WHERE status = 'executed' ORDER BY reset_at DESC LIMIT 1),
            '1970-01-01T00:00:00Z'::timestamptz
        ) AS reset_date
    ),
    closed AS (
        SELECT e.id, e.created_at
        FROM events e, reset
        WHERE e.status = 'closed' AND e.event_date > reset.reset_date  -- ใช้เกณฑ์เดียวกับหน้า Leaderboard
    ),
    lb AS (
        SELECT l.user_id, l.display_name::text, l.skill_level::text,
               l.total_wins::bigint, l.total_games::bigint
        FROM view_leaderboard l
        WHERE l.total_games > 0
    ),
    last_played AS (
        SELECT ep.user_id, MAX(c.created_at) AS last_at
        FROM event_players ep JOIN closed c ON c.id = ep.event_id
        GROUP BY ep.user_id
    )
    SELECT lb.user_id, lb.display_name, lb.skill_level, lb.total_wins, lb.total_games
    FROM lb
    LEFT JOIN last_played lp ON lp.user_id = lb.user_id
    WHERE (
        SELECT COUNT(*) FROM closed c
        WHERE lp.last_at IS NULL OR c.created_at > lp.last_at
    ) < 3
    ORDER BY lb.total_wins DESC
    LIMIT p_limit;
$$;

REVOKE ALL ON FUNCTION public.get_home_leaderboard(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_home_leaderboard(integer) TO anon, authenticated;

-- ตรวจผล: ควรได้ 0 แถว (view ที่ยังไม่เป็น security_invoker)
SELECT c.relname AS view_still_definer
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'v'
  AND NOT COALESCE(c.reloptions::text[] @> ARRAY['security_invoker=true'], false);
