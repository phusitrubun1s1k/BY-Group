// ============================================================
// Activity Log helper — บันทึกกิจกรรมลงตาราง activity_logs
// เรียกจากฝั่ง client หลังทำรายการสำคัญ (admin เท่านั้นที่เขียนได้ตาม RLS)
// ออกแบบให้ "ไม่มีวันทำ flow หลักพัง" — ถ้า log ล้มเหลวจะกลืน error เงียบๆ
// ============================================================

import { createClient } from '@/src/lib/supabase/client';

export type LogCategory = 'match' | 'payment' | 'player' | 'rank';

export const CATEGORY_LABEL: Record<LogCategory, string> = {
    match: 'จัดการแมตช์',
    payment: 'การเงิน',
    player: 'ผู้เล่นในก๊วน',
    rank: 'แรงค์ / MMR',
};

interface LogParams {
    category: LogCategory;
    action: string;            // รหัสเครื่องอ่าน เช่น 'match.create'
    description: string;       // ข้อความภาษาไทย
    targetType?: string;
    targetId?: string | null;
    eventId?: string | null;
    metadata?: Record<string, unknown>;
}

// เก็บชื่อผู้ทำรายการไว้ในหน่วยความจำ กันยิง query โปรไฟล์ซ้ำทุกครั้ง
let cachedActor: { id: string; name: string | null } | null = null;

export async function logActivity(params: LogParams): Promise<void> {
    try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        if (!cachedActor || cachedActor.id !== user.id) {
            const { data: profile } = await supabase
                .from('profiles')
                .select('display_name')
                .eq('id', user.id)
                .single();
            cachedActor = { id: user.id, name: profile?.display_name ?? null };
        }

        await supabase.from('activity_logs').insert({
            actor_id: user.id,
            actor_name: cachedActor.name,
            category: params.category,
            action: params.action,
            description: params.description,
            target_type: params.targetType ?? null,
            target_id: params.targetId ?? null,
            event_id: params.eventId ?? null,
            metadata: params.metadata ?? {},
        });
    } catch (err) {
        // การบันทึก log ต้องไม่ทำให้การทำงานหลักล้มเหลว
        console.error('logActivity failed:', err);
    }
}
