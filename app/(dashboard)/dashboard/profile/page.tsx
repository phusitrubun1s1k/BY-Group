'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/src/lib/supabase/client';
import ProfileView from './ProfileView';

export default function ProfilePage() {
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const getSession = async () => {
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();
            setCurrentUserId(user?.id || null);
            setLoading(false);
        };
        getSession();
    }, []);

    if (loading) return <div className="flex items-center justify-center py-20"><div className="spinner" style={{ width: 28, height: 28 }} /></div>;
    if (!currentUserId) return <div className="text-center py-20"><p className="text-gray-500 text-sm font-bold uppercase tracking-widest">กรุณาเข้าสู่ระบบ</p></div>;

    return <ProfileView targetUserId={currentUserId} />;
}
