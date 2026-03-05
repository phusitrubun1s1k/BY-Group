'use client';

import { useParams } from 'next/navigation';
import ProfileView from '../ProfileView';

export default function UserProfilePage() {
    const params = useParams();
    const id = params.id as string;

    if (!id) return <div className="text-center py-20 font-bold uppercase tracking-widest text-gray-400">ระบุไอดีผู้เล่นไม่ถูกต้อง</div>;

    return <ProfileView targetUserId={id} />;
}
