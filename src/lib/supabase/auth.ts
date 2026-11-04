import { cache } from 'react';
import { createClient } from '@/src/lib/supabase/server';
import type { Profile } from '@/src/types';

/**
 * ดึง user + profile ครั้งเดียวต่อ 1 request (React cache)
 * layout และ page ที่เรียกซ้ำจะได้ผลลัพธ์เดิมโดยไม่ยิง Supabase ซ้ำ
 */
export const getCurrentUser = cache(async () => {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    return user;
});

export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
    const user = await getCurrentUser();
    if (!user) return null;
    const supabase = await createClient();
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    return (data as Profile) ?? null;
});
