-- =====================================================================
-- แก้: หน้าจัดอันดับ (Leaderboard) ไม่แสดงข้อมูล หลังตั้ง view เป็น security_invoker
--
-- สาเหตุ: view_leaderboard ใช้ตาราง
--   * rating_epochs  → เคย REVOKE ALL จาก authenticated ไว้ → permission denied → ทั้ง view พัง
--   * player_payments → อ่านได้เฉพาะบิลตัวเอง → ยอด "สายเปย์" ของคนอื่นเป็น 0
--     (view_monthly_leaderboard / hall_of_fame ที่ใช้ view_billing_details ก็โดนแบบเดียวกัน)
--
-- แก้:
--   * rating_epochs: ให้ผู้ใช้ที่ login อ่านได้ (เก็บแค่ช่วงเวลาของซีซัน ไม่ใช่ข้อมูลส่วนตัว)
--   * player_payments: ให้ผู้ใช้ที่ login อ่านได้ (ยอดจ่ายแสดงในอันดับสายเปย์อยู่แล้ว
--     และ event_players.paid_amount ก็อ่านได้อยู่แล้ว) — การเขียนยังทำได้ผ่านฟังก์ชันแอดมินเท่านั้น
-- =====================================================================

GRANT SELECT ON public.rating_epochs TO authenticated;
DROP POLICY IF EXISTS rating_epochs_read ON public.rating_epochs;
CREATE POLICY rating_epochs_read ON public.rating_epochs FOR SELECT TO authenticated USING (true);

GRANT SELECT ON public.player_payments TO authenticated;
DROP POLICY IF EXISTS player_payments_read_all ON public.player_payments;
CREATE POLICY player_payments_read_all ON public.player_payments FOR SELECT TO authenticated USING (true);

-- ทดสอบในฐานะผู้ใช้ทั่วไป (ควรได้จำนวนแถว > 0 และไม่ error)
DO $$
DECLARE n integer;
BEGIN
    SET LOCAL ROLE authenticated;
    SELECT count(*) INTO n FROM public.view_leaderboard;
    RAISE NOTICE 'view_leaderboard rows (as authenticated): %', n;
    RESET ROLE;
END $$;
