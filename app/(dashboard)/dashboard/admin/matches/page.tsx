import { createClient } from '@/src/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Event } from '@/src/types';
import { Icon } from '@iconify/react';

export default async function AdminMatchesLandingPage() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user!.id).single();
    if (profile?.role !== 'admin') redirect('/dashboard');

    const { data: events } = await supabase.from('events').select('*').eq('status', 'open').order('event_date', { ascending: false });

    return (
        <div className="animate-in">
            <div className="mb-6">
                <h1 className="text-2xl font-bold" style={{ color: 'var(--gray-900)' }}>จัดแมตช์</h1>
                <p className="text-sm mt-1" style={{ color: 'var(--gray-500)' }}>เลือกก๊วนที่ต้องการจัดแมตช์</p>
            </div>

            {(events || []).length === 0 ? (
                <div className="card text-center" style={{ padding: '48px 24px' }}>
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-4" style={{ background: 'var(--gray-100)' }}>
                        <Icon icon="solar:calendar-linear" width={24} style={{ color: 'var(--gray-500)' }} />
                    </div>
                    <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--gray-900)' }}>ไม่มีก๊วนที่เปิดอยู่</h2>
                    <p className="text-sm mb-6" style={{ color: 'var(--gray-500)' }}>สร้างก๊วนใหม่ก่อนเริ่มจัดแมตช์</p>
                    <Link href="/dashboard/admin/events/create" className="btn btn-primary">สร้างก๊วนใหม่</Link>
                </div>
            ) : (
                <div className="space-y-2">
                    {(events as Event[]).map((event) => (
                        <Link key={event.id} href={`/dashboard/admin/matches/${event.id}`}
                            className="card flex items-center justify-between" style={{ padding: '16px 20px', display: 'flex' }}>
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(22,163,74,0.06)' }}>
                                    <Icon icon="solar:calendar-linear" width={20} style={{ color: 'var(--success)' }} />
                                </div>
                                <div>
                                    <p className="font-semibold text-sm" style={{ color: 'var(--gray-900)' }}>
                                        {new Date(event.event_date).toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                                    </p>
                                    <p className="text-xs" style={{ color: 'var(--gray-500)' }}>{event.shuttlecock_brand} · ฿{event.shuttlecock_price}/ลูก</p>
                                </div>
                            </div>
                            <Icon icon="solar:arrow-right-linear" width={18} style={{ color: 'var(--orange-500)' }} />
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}
