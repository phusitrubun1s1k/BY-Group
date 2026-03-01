import { createClient } from '@/src/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Event } from '@/src/types';
import { Icon } from '@iconify/react';

export default async function EventHistoryListPage() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user!.id).single();
    if (profile?.role !== 'admin') redirect('/dashboard');

    const { data: events } = await supabase.from('events').select('*').order('event_date', { ascending: false });

    const eventsWithCounts = await Promise.all(
        (events || []).map(async (event: Event) => {
            const { count } = await supabase.from('event_players').select('*', { count: 'exact', head: true }).eq('event_id', event.id);
            return { ...event, playerCount: count || 0 };
        })
    );

    return (
        <div className="animate-in">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-2xl font-bold" style={{ color: 'var(--gray-900)' }}>ประวัติก๊วน</h1>
                    <p className="text-sm mt-1" style={{ color: 'var(--gray-500)' }}>ย้อนดูข้อมูลก๊วนที่ผ่านมาทั้งหมด</p>
                </div>
            </div>

            {eventsWithCounts.length === 0 ? (
                <div className="card text-center" style={{ padding: '64px 32px' }}>
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-sm" style={{ background: 'var(--gray-100)' }}>
                        <Icon icon="solar:clock-circle-linear" width={28} style={{ color: 'var(--gray-500)' }} />
                    </div>
                    <h2 className="text-xl font-bold mb-2 tracking-tight" style={{ color: 'var(--gray-900)' }}>ยังไม่มีประวัติก๊วน</h2>
                    <p className="text-sm font-medium" style={{ color: 'var(--gray-500)' }}>ประวัติจะแสดงที่นี่เมื่อมีก๊วนที่ปิดแล้ว</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {eventsWithCounts.map((event) => (
                        <Link key={event.id} href={`/dashboard/history/${event.id}`}
                            className="card flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all hover:border-orange-200"
                            style={{ padding: '20px 24px', display: 'flex' }}>
                            <div className="flex items-center gap-5">
                                <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-sm"
                                    style={{ background: event.status === 'open' ? 'rgba(22,163,74,0.08)' : 'var(--gray-100)' }}>
                                    <Icon icon="solar:calendar-bold-duotone" width={24}
                                        style={{ color: event.status === 'open' ? 'var(--success)' : 'var(--gray-500)' }} />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2.5 mb-1">
                                        <p className="font-bold text-[15px]" style={{ color: 'var(--gray-900)' }}>
                                            {new Date(event.event_date).toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                                        </p>
                                        <span className={`badge ${event.status === 'open' ? 'badge-success' : 'badge-muted'}`}>
                                            {event.status === 'open' ? 'เปิด' : 'ปิดแล้ว'}
                                        </span>
                                    </div>
                                    <p className="text-xs" style={{ color: 'var(--gray-500)' }}>
                                        {event.shuttlecock_brand} · ฿{event.shuttlecock_price}/ลูก · ค่าสนาม ฿{event.entry_fee}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-4 text-sm" style={{ color: 'var(--gray-500)' }}>
                                <span>{event.playerCount} ผู้เล่น</span>
                                <Icon icon="solar:arrow-right-linear" width={16} style={{ color: 'var(--orange-500)' }} />
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}
