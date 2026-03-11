import { createClient } from '@/src/lib/supabase/server';
import type { Event } from '@/src/types';
import Link from 'next/link';
import { Icon } from '@iconify/react';
import DashboardPaymentStatus from '@/src/components/DashboardPaymentStatus';

export default async function DashboardPage() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const { data: profile } = await supabase
        .from('profiles').select('*').eq('id', user!.id).single();

    // Find the latest open event, or the absolute latest event
    const { data: events } = await supabase
        .from('events')
        .select('*')
        .order('status', { ascending: false }) // 'open' before 'closed'
        .order('event_date', { ascending: false })
        .limit(1);

    const todayEvent = events?.[0] || null;
    const today = todayEvent?.event_date || new Date().toLocaleDateString('en-CA');

    let playerCount = 0;
    let myPlayer = null;
    let todayBillAmount = 0;
    let myMatchCount = 0;

    if (todayEvent) {
        const { count } = await supabase
            .from('event_players').select('*', { count: 'exact', head: true }).eq('event_id', todayEvent.id);
        playerCount = count || 0;

        const { data } = await supabase
            .from('event_players').select('*').eq('event_id', todayEvent.id).eq('user_id', user!.id).maybeSingle();
        myPlayer = data;

        if (myPlayer) {
            try {
                // Get match count
                const { count: matchCount } = await supabase
                    .from('match_players')
                    .select('*, matches!inner(*)', { count: 'exact', head: true })
                    .eq('user_id', user!.id)
                    .eq('matches.event_id', todayEvent.id)
                    .in('matches.status', ['playing', 'finished']);
                myMatchCount = matchCount || 0;

                const { data: summary } = await supabase.from('view_billing_summary')
                    .select('*')
                    .eq('event_date', today)
                    .eq('user_id', user!.id)
                    .maybeSingle();

                if (summary) {
                    todayBillAmount = summary.total_cost || summary.total_amount || summary.amount || summary.cost || 0;
                } else {
                    const { data: todayMatches } = await supabase.from('match_players').select('*, matches!inner(*)').eq('user_id', user!.id).eq('matches.event_id', todayEvent.id).in('matches.status', ['finished', 'playing']);
                    let totalShuttles = 0;
                    todayMatches?.forEach((mp: any) => {
                        if (mp.matches && mp.matches.shuttlecock_numbers) {
                            totalShuttles += mp.matches.shuttlecock_numbers.length;
                        }
                    });
                    todayBillAmount = todayEvent.entry_fee + (todayEvent.shuttlecock_price * totalShuttles) + (myPlayer.additional_cost || 0) - (myPlayer.discount || 0);
                    todayBillAmount = Math.max(0, todayBillAmount);
                }
            } catch (e) {
                console.error('Error fetching billing info:', e);
            }
        }
    }

    const event = todayEvent as Event | null;

    return (
        <div className="animate-in grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Main Content (8 Columns) */}
            <div className="col-span-1 lg:col-span-8">
                {/* Today's Event */}
                {event ? (
                    <div className="card h-full flex flex-col mb-6 lg:mb-0 relative overflow-hidden" style={{ padding: '32px' }}>
                        {/* Decorative Background */}
                        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-orange-400/10 to-transparent rounded-bl-full pointer-events-none" />

                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6 relative z-10">
                            <div>
                                <div className="flex items-center gap-2 mb-2">
                                    <div className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ background: event.status === 'open' ? 'var(--success)' : 'var(--gray-400)' }} />
                                    <span className="text-sm font-bold tracking-wide uppercase" style={{ color: event.status === 'open' ? 'var(--success)' : 'var(--gray-500)' }}>
                                        {event.status === 'open' ? 'ก๊วนเปิดอยู่' : 'ก๊วนปิดแล้ว'}
                                    </span>
                                </div>
                                <h2 className="text-2xl font-black tracking-tight" style={{ color: 'var(--gray-900)' }}>
                                    {new Date(event.event_date).toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                                </h2>
                            </div>

                            {/* Personalized Status Badge */}
                            {myPlayer ? (
                                <div className="flex flex-col items-end gap-1.5 shrink-0">
                                    <span className="text-xs font-bold uppercase tracking-wide text-gray-500">สถานะของคุณ</span>
                                    <div className="flex flex-wrap justify-end gap-2 max-w-[280px]">
                                        {todayBillAmount > 0 && (
                                            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold shadow-sm" style={{ background: 'var(--gray-900)', color: 'white' }}>
                                                <Icon icon="solar:bill-list-bold" width={16} /> ยอดรวม ฿{todayBillAmount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                                            </div>
                                        )}
                                        {myPlayer.is_checked_in ? (
                                            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold shadow-sm" style={{ background: 'var(--orange-500)', color: 'white' }}>
                                                <Icon icon="solar:check-read-bold" width={16} /> เช็คอินแล้ว
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold shadow-sm" style={{ background: 'white', border: '1px solid var(--gray-200)', color: 'var(--gray-600)' }}>
                                                <Icon icon="solar:user-rounded-bold" width={16} /> เข้าร่วมก๊วนแล้ว
                                            </div>
                                        )}
                                        {myPlayer.payment_status === 'paid' ? (
                                            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold shadow-sm" style={{ background: 'rgba(22,163,74,0.1)', color: 'var(--success)' }}>
                                                <Icon icon="solar:wallet-money-bold" width={16} /> จ่ายแล้ว
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold shadow-sm" style={{ background: 'rgba(234,88,12,0.1)', color: 'var(--warning)' }}>
                                                <Icon icon="solar:wallet-money-linear" width={16} /> รอชำระ
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold shadow-sm" style={{ background: 'var(--gray-100)', color: 'var(--gray-500)' }}>
                                    <Icon icon="solar:info-circle-bold" width={16} /> ยังไม่ได้เข้าร่วม
                                </div>
                            )}
                        </div>

                        {/* Rich Stats Grid */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                            <div className="flex flex-col gap-1 p-4 rounded-2xl" style={{ background: 'var(--gray-50)' }}>
                                <Icon icon="solar:clock-circle-bold" width={24} style={{ color: 'var(--orange-500)' }} />
                                <span className="text-xs font-semibold mt-2" style={{ color: 'var(--gray-500)' }}>เวลาเล่น</span>
                                <span className="text-base font-bold" style={{ color: 'var(--gray-900)' }}>
                                    {event.start_time?.slice(0, 5) || '19:00'} - {event.end_time?.slice(0, 5) || '23:00'}
                                </span>
                            </div>
                            <div className="flex flex-col gap-1 p-4 rounded-2xl" style={{ background: 'var(--gray-50)' }}>
                                <Icon icon="solar:map-point-wave-bold" width={24} style={{ color: '#3b82f6' }} />
                                <span className="text-xs font-semibold mt-2" style={{ color: 'var(--gray-500)' }}>คอร์ท</span>
                                <span className="text-base font-bold" style={{ color: 'var(--gray-900)' }}>
                                    {event.courts?.length ? event.courts.join(', ') : '-'}
                                </span>
                            </div>
                            <div className="flex flex-col gap-1 p-4 rounded-2xl" style={{ background: 'var(--gray-50)' }}>
                                <Icon icon="solar:tag-bold" width={24} style={{ color: '#10b981' }} />
                                <span className="text-xs font-semibold mt-2" style={{ color: 'var(--gray-500)' }}>ค่าสนาม / ลูก</span>
                                <span className="text-base font-bold" style={{ color: 'var(--gray-900)' }}>
                                    ฿{event.entry_fee} / ฿{event.shuttlecock_price}
                                </span>
                            </div>
                            <div className="flex flex-col gap-1 p-4 rounded-2xl" style={{ background: 'var(--gray-50)' }}>
                                <Icon icon="solar:users-group-two-rounded-bold" width={24} style={{ color: '#8b5cf6' }} />
                                <span className="text-xs font-semibold mt-2" style={{ color: 'var(--gray-500)' }}>ยอดผู้เล่น</span>
                                <span className="text-base font-bold" style={{ color: 'var(--gray-900)' }}>
                                    {playerCount} คน
                                </span>
                            </div>
                            <div className="flex flex-col gap-1 p-4 rounded-2xl" style={{ background: 'var(--gray-50)' }}>
                                <Icon icon="solar:medal-ribbon-bold" width={24} style={{ color: '#f59e0b' }} />
                                <span className="text-xs font-semibold mt-2" style={{ color: 'var(--gray-500)' }}>แมตช์ที่เล่นไป</span>
                                <span className="text-base font-bold" style={{ color: 'var(--gray-900)' }}>
                                    {myMatchCount} เกม
                                </span>
                            </div>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-3 mt-auto relative z-10">
                            <Link href="/dashboard/live" className="btn btn-primary" style={{ padding: '12px 24px', fontSize: '15px' }}>
                                <Icon icon="solar:monitor-smartphone-linear" width={20} />
                                ดูกระดานคิว
                            </Link>
                            {profile?.role === 'admin' && (
                                <Link href={`/dashboard/admin/events/${event.id}`} className="btn btn-secondary" style={{ padding: '12px 24px', fontSize: '15px' }}>
                                    <Icon icon="solar:calendar-linear" width={20} />
                                    จัดการก๊วน
                                </Link>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="card text-center h-full flex flex-col items-center justify-center mb-6 lg:mb-0" style={{ padding: '48px 24px' }}>
                        <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-4" style={{ background: 'var(--gray-100)' }}>
                            <Icon icon="solar:calendar-linear" width={24} style={{ color: 'var(--gray-500)' }} />
                        </div>
                        <h2 className="text-lg font-bold mb-2" style={{ color: 'var(--gray-900)' }}>ยังไม่มีการสร้างก๊วน</h2>
                        <p className="text-sm mb-6" style={{ color: 'var(--gray-500)' }}>
                            {profile?.role === 'admin' ? 'เริ่มสร้างก๊วนใหม่เพื่อจัดการแมตช์ได้เลย' : 'รอผู้จัดสร้างก๊วนก่อนนะ'}
                        </p>
                        {profile?.role === 'admin' && (
                            <Link href="/dashboard/admin/events/create" className="btn btn-primary">
                                <Icon icon="solar:add-circle-linear" width={18} />
                                สร้างก๊วนใหม่
                            </Link>
                        )}
                    </div>
                )}
            </div>

            {/* Sidebar (4 Columns) */}
            <div className="col-span-1 lg:col-span-4 flex flex-col gap-4">
                {/* Profile Card */}
                <div className="card overflow-hidden border-none shadow-sm" style={{ padding: 0 }}>
                    <div className="bg-gradient-to-r from-gray-900 to-gray-800 p-6 relative">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-bl-full pointer-events-none" />
                        <div className="flex items-center gap-5 relative z-10">
                            <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-black shadow-lg bg-orange-500 text-white border-2 border-white/20">
                                {profile?.display_name?.charAt(0).toUpperCase() || 'U'}
                            </div>
                            <div className="flex-1">
                                <h2 className="text-xl font-black text-white truncate max-w-[200px]">{profile?.display_name}</h2>
                                <p className="text-sm font-medium text-gray-400 truncate max-w-[200px]">{profile?.full_name || 'ไม่ได้ระบุชื่อจริง'}</p>
                                <div className="flex items-center gap-2 mt-2">
                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-white/10 text-white border border-white/10">
                                        {profile?.role === 'admin' ? 'ผู้จัดก๊วน' : 'ผู้เล่น'}
                                    </span>
                                    {profile?.skill_level && (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-orange-500/20 text-orange-300 border border-orange-500/20">
                                            {profile.skill_level}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="card" style={{ padding: '24px' }}>
                    <h2 className="text-base font-bold mb-4" style={{ color: 'var(--gray-900)' }}>เมนูลัด</h2>
                    <div className="flex flex-col gap-3">
                        {[
                            { href: '/dashboard/live', icon: 'solar:monitor-smartphone-linear', title: 'กระดานคิว', desc: 'ดูคิวแมตช์แบบเรียลไทม์' },
                            { href: '/dashboard/leaderboard', icon: 'solar:cup-star-linear', title: 'จัดอันดับ', desc: 'ดูอันดับสถิติผู้เล่น' },
                            { href: '/dashboard/profile', icon: 'solar:user-circle-linear', title: 'โปรไฟล์', desc: 'ข้อมูลส่วนตัวและบิล' },
                        ].map((item, i) => (
                            <Link key={i} href={item.href} className="flex items-center gap-4 p-3 rounded-xl transition-all hover:bg-gray-50 border border-transparent hover:border-gray-200 group">
                                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--gray-100)' }}>
                                    <Icon icon={item.icon} width={20} style={{ color: 'var(--gray-500)' }} className="group-hover:text-orange-500 transition-colors" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="font-semibold text-sm truncate" style={{ color: 'var(--gray-900)' }}>{item.title}</h3>
                                    <p className="text-xs truncate" style={{ color: 'var(--gray-500)' }}>{item.desc}</p>
                                </div>
                                <Icon icon="solar:alt-arrow-right-linear" width={16} style={{ color: 'var(--gray-400)' }} className="opacity-0 translate-x-[-10px] group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                            </Link>
                        ))}
                    </div>
                </div>

                {/* Payment Status — Admin Only */}
                {profile?.role === 'admin' && (
                    <DashboardPaymentStatus />
                )}
            </div>
        </div>
    );
}
