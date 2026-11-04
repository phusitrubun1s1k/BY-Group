-- =====================================================================
-- แก้: Rating Progress / ประวัติบิล / ข้อมูลจาก view หายหลังตั้ง security_invoker
--
-- สาเหตุ: view สาธารณะ (เช่น view_mmr_history) ดึงข้อมูลต่อจาก view ภายใน
-- ชื่อ migration_source_* ซึ่งเคย REVOKE สิทธิ์จาก authenticated ไว้
-- ตอนเป็น security definer ไม่มีปัญหา แต่พอเป็น security_invoker ผู้ใช้ต้องมีสิทธิ์
-- อ่าน view ภายในด้วย → ไม่มีสิทธิ์ → query error → หน้าเว็บแสดงว่าง
--
-- แก้: ให้ authenticated อ่าน migration_source_* ได้ (view ภายในก็เป็น security_invoker
-- จึงยังถูก RLS คุม และ view บิลยังกรอง user_id = ตัวเอง หรือแอดมิน เหมือนเดิม)
-- =====================================================================
DO $$
DECLARE r record;
BEGIN
    FOR r IN
        SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'v' AND (c.relname LIKE 'integrity_source_%' OR c.relname LIKE 'migration_source_%')
    LOOP
        EXECUTE format('ALTER VIEW public.%I SET (security_invoker = true)', r.relname);
        EXECUTE format('GRANT SELECT ON public.%I TO authenticated', r.relname);
        RAISE NOTICE 'granted: %', r.relname;
    END LOOP;
END $$;

-- ตรวจ: ทุก view ที่แอปใช้ ต้องให้ authenticated อ่านได้ (ควรเป็น true ทั้งหมด)
SELECT c.relname AS view_name,
       has_table_privilege('authenticated', c.oid, 'SELECT') AS authenticated_can_read
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'v'
ORDER BY 2, 1;
