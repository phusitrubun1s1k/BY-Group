import { createClient } from '@/src/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Event } from '@/src/types';
import { Icon } from '@iconify/react';

export default async function EventsListPage() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user!.id).single();
    if (profile?.role !== 'admin') redirect('/dashboard');

    const { data: events } = await supabase
        .from('events')
        .select('*')
        .order('event_date', { ascending: false })
        .order('created_at', { ascending: false });

    const eventsWithCounts = await Promise.all(
        (events || []).map(async (event: Event) => {
            const { data } = await supabase.from('event_players').select('payment_status').eq('event_id', event.id);
            const players = data || [];
            const paidCount = players.filter(p => p.payment_status === 'paid').length;
            const pendingCount = players.filter(p => p.payment_status === 'pending').length;
            return { ...event, playerCount: players.length, paidCount, pendingCount };
        })
    );

    return (
        <div className="animate-in">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-2xl font-bold" style={{ color: 'var(--gray-900)' }}>จัดการก๊วน</h1>
                    <p className="text-sm mt-1" style={{ color: 'var(--gray-500)' }}>รายการก๊วนทั้งหมด</p>
                </div>
                <Link href="/dashboard/admin/events/create" className="btn btn-primary">
                    <Icon icon="solar:add-circle-linear" width={18} />
                    สร้างก๊วนใหม่
                </Link>
            </div>

            {eventsWithCounts.length === 0 ? (
                <div className="card text-center" style={{ padding: '64px 32px' }}>
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-sm" style={{ background: 'var(--gray-100)' }}>
                        <Icon icon="solar:calendar-linear" width={28} style={{ color: 'var(--gray-500)' }} />
                    </div>
                    <h2 className="text-xl font-bold mb-2 tracking-tight" style={{ color: 'var(--gray-900)' }}>ยังไม่มีก๊วน</h2>
                    <p className="text-sm mb-8 font-medium" style={{ color: 'var(--gray-500)' }}>เริ่มสร้างก๊วนแรกของคุณได้เลย</p>
                    <Link href="/dashboard/admin/events/create" className="btn btn-primary" style={{ padding: '12px 24px' }}>สร้างก๊วนใหม่</Link>
                </div>
            ) : (
                <div className="space-y-3">
                    {eventsWithCounts.map((event) => (
                        <Link key={event.id} href={`/dashboard/admin/events/${event.id}`}
                            className="card flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all hover:border-orange-200"
                            style={{ padding: '20px 24px', display: 'flex' }}>
                            <div className="flex items-center gap-5">
                                <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-sm"
                                    style={{ background: event.status === 'open' ? 'rgba(22,163,74,0.08)' : 'var(--gray-100)' }}>
                                    <Icon icon="solar:calendar-linear" width={24}
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
                            <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2 sm:gap-4 text-sm" style={{ color: 'var(--gray-500)' }}>
                                <div className="flex items-center gap-1.5">
                                    {event.paidCount > 0 && (
                                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md" style={{ background: 'rgba(22,163,74,0.08)', color: 'var(--success)' }}>
                                            จ่ายแล้ว {event.paidCount}
                                        </span>
                                    )}
                                    {event.pendingCount > 0 && (
                                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md" style={{ background: 'rgba(234,88,12,0.08)', color: 'var(--warning)' }}>
                                            ค้างจ่าย {event.pendingCount}
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-1">
                                    <Icon icon="solar:users-group-rounded-linear" width={16} />
                                    <span>{event.playerCount}</span>
                                </div>
                                <Icon icon="solar:arrow-right-linear" width={16} style={{ color: 'var(--orange-500)' }} className="hidden sm:block" />
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}
