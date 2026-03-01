'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/src/lib/supabase/client';
import type { Event, Match, Profile, EventPlayer } from '@/src/types';
import { Icon } from '@iconify/react';
import Link from 'next/link';

export default function LiveBoardPage() {
    const [event, setEvent] = useState<Event | null>(null);
    const [matches, setMatches] = useState<Match[]>([]);
    const [loading, setLoading] = useState(true);
    const [playerCount, setPlayerCount] = useState(0);
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);

    const [eventPlayers, setEventPlayers] = useState<EventPlayer[]>([]);
    const [myBill, setMyBill] = useState<{ amount: number; totalGames: number; totalShuttlecocks: number } | null>(null);

    const fetchMatches = async (eventId: string, userId: string | undefined, currentFee: number, currentShuttlecockPrice: number) => {
        const supabase = createClient();
        const [matchesRes, playersRes] = await Promise.all([
            supabase.from('matches').select('*, match_players(*, profiles(*))').eq('event_id', eventId).order('created_at', { ascending: true }),
            supabase.from('event_players').select('*, profiles(*)').eq('event_id', eventId),
        ]);
        if (matchesRes.data) {
            const newMatches = matchesRes.data as Match[];
            setMatches(newMatches);

            // Re-calculate local bill if user is checked in
            if (userId && playersRes.data) {
                const isCheckedIn = (playersRes.data as any[]).some(ep => ep.user_id === userId);
                if (isCheckedIn) {
                    const myFinishedMatches = newMatches.filter(m =>
                        (m.status === 'finished' || m.status === 'playing') &&
                        m.match_players?.some(mp => mp.user_id === userId)
                    );

                    const totalGames = myFinishedMatches.length;
                    let totalShuttles = 0;

                    myFinishedMatches.forEach(m => {
                        if (m.shuttlecock_numbers) {
                            totalShuttles += m.shuttlecock_numbers.length;
                        }
                    });

                    const amount = currentFee + (currentShuttlecockPrice * totalShuttles);

                    setMyBill({
                        amount,
                        totalGames,
                        totalShuttlecocks: totalShuttles
                    });
                }
            }
        }
        if (playersRes.data) {
            setEventPlayers(playersRes.data as EventPlayer[]);
            setPlayerCount(playersRes.data.length);
        }
    };

    const initData = async () => {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();

        // Find the latest open event, or the absolute latest event
        const { data: events } = await supabase
            .from('events')
            .select('*')
            .order('status', { ascending: false }) // 'open' before 'closed'
            .order('event_date', { ascending: false })
            .limit(1);

        const latestEvent = events?.[0];

        if (latestEvent) {
            setEvent(latestEvent as Event);
            if (user) setCurrentUserId(user.id);
            await fetchMatches(latestEvent.id, user?.id, latestEvent.entry_fee, latestEvent.shuttlecock_price);
        }
        setLoading(false);
    };

    // Initial data load, runs once on mount
    useEffect(() => { initData(); }, []);

    useEffect(() => {
        if (!event?.id) return;
        const supabase = createClient();

        const setupSubscription = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            const channel = supabase.channel('live-board')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, () => {
                    console.log("Realtime: match changed");
                    fetchMatches(event.id, user?.id, event.entry_fee, event.shuttlecock_price);
                })
                .on('postgres_changes', { event: '*', schema: 'public', table: 'event_players' }, () => {
                    console.log("Realtime: event_players changed");
                    fetchMatches(event.id, user?.id, event.entry_fee, event.shuttlecock_price);
                })
                .on('postgres_changes', { event: '*', schema: 'public', table: 'match_players' }, () => {
                    console.log("Realtime: match_players changed");
                    fetchMatches(event.id, user?.id, event.entry_fee, event.shuttlecock_price);
                })
                .subscribe((status) => {
                    console.log("Supabase realtime status:", status);
                });
            return channel;
        };

        let activeChannel: any = null;
        setupSubscription().then(channel => { activeChannel = channel; });

        return () => {
            if (activeChannel) supabase.removeChannel(activeChannel);
        };
    }, [event?.id, event?.entry_fee, event?.shuttlecock_price]); // Event prices and ID dependencies

    if (loading) return <div className="flex items-center justify-center py-20"><div className="spinner" style={{ width: 28, height: 28 }} /></div>;

    if (!event) return (
        <div className="animate-in text-center py-20">
            <div className="w-14 h-14 rounded-xl flex items-center justify-center mx-auto mb-4" style={{ background: 'var(--gray-100)' }}>
                <Icon icon="solar:calendar-linear" width={28} style={{ color: 'var(--gray-500)' }} />
            </div>
            <h1 className="text-xl font-bold mb-2" style={{ color: 'var(--gray-900)' }}>ยังไม่มีการสร้างก๊วน</h1>
            <p className="text-sm" style={{ color: 'var(--gray-500)' }}>รอผู้จัดสร้างก๊วนก่อนนะ</p>
        </div>
    );

    const playingMatches = matches.filter((m) => m.status === 'playing');
    const waitingMatches = matches.filter((m) => m.status === 'waiting');
    const finishedMatches = matches.filter((m) => m.status === 'finished');

    const playingPlayerIds = new Set(matches.filter(m => m.status !== 'finished').flatMap(m => m.match_players?.map(mp => mp.user_id) || []));
    const waitingToPlay = eventPlayers.filter(ep => !playingPlayerIds.has(ep.user_id));

    const statusCfg: Record<string, { label: string; badge: string; borderColor: string; icon: string }> = {
        playing: { label: 'กำลังตี', badge: 'badge-success', borderColor: 'rgba(22,163,74,0.2)', icon: 'solar:play-bold' },
        waiting: { label: 'รอคิว', badge: 'badge-warning', borderColor: 'rgba(217,119,6,0.2)', icon: 'solar:hourglass-linear' },
        finished: { label: 'จบแล้ว', badge: 'badge-muted', borderColor: 'var(--gray-200)', icon: 'solar:check-circle-linear' },
    };

    const renderMatchCard = (match: Match) => {
        const cfg = statusCfg[match.status];
        const tA = match.match_players?.filter((mp) => mp.team === 'A') || [];
        const tB = match.match_players?.filter((mp) => mp.team === 'B') || [];
        const shuttlecockNums = match.shuttlecock_numbers || [];

        return (
            <div key={match.id} className="card hover-scale transition-all" style={{ padding: '16px 20px', borderColor: cfg.borderColor, borderWidth: '2px' }}>
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <span className={`badge ${cfg.badge}`}>
                            <Icon icon={cfg.icon} width={12} className="mr-1" />
                            {cfg.label}
                        </span>
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                            คอร์ท {match.court_number}
                        </span>
                    </div>
                    {shuttlecockNums.length > 0 && (
                        <div className="flex items-center gap-1">
                            {shuttlecockNums.map((num: string, i: number) => (
                                <span key={i} className="w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold bg-orange-100 text-orange-600 border border-orange-200">
                                    {num}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex-1 text-center p-3 rounded-xl border border-dashed border-gray-200" style={{ background: 'var(--white)' }}>
                        {tA.map((mp) => {
                            const isMe = mp.user_id === currentUserId;
                            return (
                                <p key={mp.id} className="text-sm truncate" style={{
                                    color: isMe ? 'var(--orange-600)' : 'var(--gray-900)',
                                    fontWeight: isMe ? '900' : 'bold',
                                    textShadow: isMe ? '0 0 1px rgba(249,115,22,0.3)' : 'none',
                                }}>
                                    {(mp.profiles as unknown as Profile)?.display_name} {isMe && '(คุณ)'}
                                </p>
                            );
                        })}
                    </div>
                    <div className="shrink-0 text-center">
                        {match.status === 'finished' ? (
                            <div className="flex flex-col items-center">
                                <p className="text-xl font-black leading-none" style={{ color: 'var(--gray-900)' }}>
                                    <span style={{ color: (match.team_a_score ?? 0) > (match.team_b_score ?? 0) ? 'var(--orange-500)' : 'var(--gray-900)' }}>{match.team_a_score}</span>
                                    <span style={{ color: 'var(--gray-300)', margin: '0 4px' }}>:</span>
                                    <span style={{ color: (match.team_b_score ?? 0) > (match.team_a_score ?? 0) ? '#3b82f6' : 'var(--gray-900)' }}>{match.team_b_score}</span>
                                </p>
                            </div>
                        ) : (
                            <div className="w-8 h-8 rounded-full flex items-center justify-center bg-gray-50 border border-gray-100">
                                <span className="text-[10px] font-black italic text-gray-400">VS</span>
                            </div>
                        )}
                    </div>
                    <div className="flex-1 text-center p-3 rounded-xl border border-dashed border-gray-200" style={{ background: 'var(--white)' }}>
                        {tB.map((mp) => {
                            const isMe = mp.user_id === currentUserId;
                            return (
                                <p key={mp.id} className="text-sm truncate" style={{
                                    color: isMe ? '#2563eb' : 'var(--gray-900)',
                                    fontWeight: isMe ? '900' : 'bold',
                                    textShadow: isMe ? '0 0 1px rgba(59,130,246,0.3)' : 'none',
                                }}>
                                    {(mp.profiles as unknown as Profile)?.display_name} {isMe && '(คุณ)'}
                                </p>
                            );
                        })}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="animate-in grid grid-cols-1 lg:grid-cols-12 gap-6 relative">
            {/* Header */}
            <div className="col-span-1 lg:col-span-12 mb-2 flex items-center justify-between">
                <div>
                    {event.status === 'closed' ? (
                        <div className="flex items-center gap-2 mb-1">
                            <div className="w-2 h-2 rounded-full bg-gray-400" />
                            <span className="text-xs font-bold uppercase tracking-widest text-gray-400">EVENT CLOSED</span>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2 mb-1">
                            <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: 'var(--success)' }} />
                            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--success)' }}>LIVE BOARD</span>
                        </div>
                    )}
                    <h1 className="text-3xl font-black tracking-tight" style={{ color: 'var(--gray-900)' }}>
                        {event.status === 'closed' ? 'ก๊วนปิดแล้ว (สรุปยอดวันนี้)' : 'กระดานคิวอัจฉริยะ'}
                    </h1>
                </div>
                <div className="flex items-center gap-3">
                    <div className="hidden sm:flex flex-col items-end">
                        <p className="text-xs font-bold text-gray-400 uppercase">ราคาลูกแบด</p>
                        <p className="text-sm font-black text-orange-500">฿{event.shuttlecock_price}/ลูก</p>
                    </div>
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-orange-500 shadow-lg shadow-orange-200">
                        <Icon icon="solar:monitor-bold-duotone" width={24} className="text-white" />
                    </div>
                </div>
            </div>

            {/* Left Column: Matches (8 Cols) */}
            <div className="col-span-1 lg:col-span-8 flex flex-col gap-8">
                {/* Playing matches */}
                {event.status === 'open' && [
                    { items: playingMatches, label: 'กำลังตี', icon: 'solar:play-bold-duotone', color: 'var(--success)' },
                    { items: waitingMatches, label: 'รอคิว', icon: 'solar:hourglass-bold-duotone', color: 'var(--warning)' },
                ].map((section) => section.items.length > 0 && (
                    <div key={section.label} className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `rgba(${(section.items[0].status === 'playing' ? '22, 163, 74' : (section.items[0].status === 'waiting' ? '217, 119, 6' : '107, 114, 128'))}, 0.1)` }}>
                                <Icon icon={section.icon} width={20} style={{ color: section.color }} />
                            </div>
                            <h2 className="text-lg font-black tracking-tight" style={{ color: 'var(--gray-900)' }}>
                                {section.label} <span className="ml-1 text-sm font-bold opacity-30">({section.items.length})</span>
                            </h2>
                            <div className="h-px flex-1 bg-gray-100 ml-2" />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {section.items.map(renderMatchCard)}
                        </div>
                    </div>
                ))}

                {[
                    { items: finishedMatches, label: event.status === 'closed' ? 'ผลการแข่งขันทั้งหมด' : 'จบแล้ววันนี้', icon: 'solar:check-circle-bold-duotone', color: 'var(--gray-400)' },
                ].map((section) => section.items.length > 0 && (
                    <div key={section.label} className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(107, 114, 128, 0.1)' }}>
                                <Icon icon={section.icon} width={20} style={{ color: section.color }} />
                            </div>
                            <h2 className="text-lg font-black tracking-tight" style={{ color: 'var(--gray-900)' }}>
                                {section.label} <span className="ml-1 text-sm font-bold opacity-30">({section.items.length})</span>
                            </h2>
                            <div className="h-px flex-1 bg-gray-100 ml-2" />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {section.items.map(renderMatchCard)}
                        </div>
                    </div>
                ))}

                {matches.length === 0 && (
                    <div className="card text-center border-dashed" style={{ padding: '64px 24px', background: 'transparent' }}>
                        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6 bg-gray-50 border border-gray-100">
                            <Icon icon="solar:gamepad-old-linear" width={32} style={{ color: 'var(--gray-300)' }} />
                        </div>
                        <h2 className="text-xl font-black mb-2" style={{ color: 'var(--gray-400)' }}>ยังไม่มีการแข่งขัน</h2>
                        <p className="text-sm max-w-xs mx-auto text-gray-400">{event.status === 'closed' ? 'วันนี้ไม่มีการแข่งขัน' : 'ข้อมูลจะปรากฏที่นี่ทันทีเมื่อแอดมินเริ่มจัดแมตช์'}</p>
                    </div>
                )}
            </div>

            {/* Right Column: Sidebar (4 Cols) */}
            <div className="col-span-1 lg:col-span-4 flex flex-col gap-6">
                {/* My Bill Summary */}
                {myBill && (
                    <div className={`card p-6 border-none shadow-xl transition-all duration-500 animate-in ${eventPlayers.find(ep => ep.user_id === currentUserId)?.payment_status === 'paid'
                            ? 'bg-gradient-to-br from-green-50 to-white ring-1 ring-green-100'
                            : 'bg-gradient-to-br from-blue-50 to-white ring-1 ring-blue-100'
                        }`}>
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-inner transition-colors duration-500 ${eventPlayers.find(ep => ep.user_id === currentUserId)?.payment_status === 'paid' ? 'bg-green-500' : 'bg-blue-500'
                                    }`}>
                                    <Icon icon="solar:wallet-bold-duotone" width={22} />
                                </div>
                                <div>
                                    <h2 className="text-lg font-black tracking-tight text-gray-900">ค่าใช้จ่ายของฉัน</h2>
                                    <p className="text-xs font-bold text-gray-500">รวมค่าสนามและค่าลูกแบด</p>
                                </div>
                            </div>
                            {eventPlayers.find(ep => ep.user_id === currentUserId)?.payment_status === 'paid' && (
                                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-green-500 text-white text-[10px] font-black uppercase tracking-widest shadow-lg shadow-green-200 animate-in fade-in zoom-in">
                                    <Icon icon="solar:check-circle-bold" width={14} />
                                    จ่ายแล้ว
                                </span>
                            )}
                        </div>


                        <div className="bg-white/60 backdrop-blur-xl border border-white/80 rounded-2xl p-4 shadow-sm mb-4">
                            <div className="flex items-baseline gap-2 mb-3 border-b border-gray-100 pb-3">
                                <span className="text-3xl font-black text-gray-900 tracking-tighter">
                                    ฿{myBill.amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                                </span>
                                <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">ยอดรวม</span>
                            </div>

                            <div className="space-y-2">
                                <div className="flex items-center justify-between text-sm">
                                    <span className="font-bold text-gray-500">ค่าสนาม</span>
                                    <span className="font-black text-gray-900">฿{event.entry_fee}</span>
                                </div>
                                <div className="flex items-center justify-between text-sm">
                                    <span className="font-bold text-gray-500">ค่าลูกแบด <span className="text-xs font-bold text-gray-400">({myBill.totalShuttlecocks} ลูก)</span></span>
                                    <span className="font-black text-blue-600">+ ฿{Math.max(0, myBill.amount - event.entry_fee).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span>
                                </div>
                                <div className="flex items-center justify-between text-sm">
                                    <span className="font-bold text-gray-500">จำนวนเกมที่เล่น</span>
                                    <span className="font-black text-gray-900">{myBill.totalGames} เกม</span>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-3 p-3 rounded-xl bg-amber-50 border border-amber-200">
                            <div className="w-7 h-7 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                                <Icon icon="solar:info-circle-bold" width={16} />
                            </div>
                            <span className="text-xs font-bold text-amber-800">กรุณาชำระเงินที่เคาน์เตอร์หน้าสนาม</span>
                        </div>
                    </div>
                )}

                {/* Waiting Players Section */}
                {event.status === 'open' && (
                    <div className="card shadow-xl border-none overflow-hidden" style={{ padding: 0 }}>
                        <div className="p-5 bg-gray-900">
                            <div className="flex items-center justify-between mb-1">
                                <h3 className="text-white font-black tracking-tight">รายชื่อคนว่าง</h3>
                                <span className="text-[10px] font-bold text-orange-400 bg-orange-400/10 px-2 py-0.5 rounded-full uppercase">Waiting</span>
                            </div>
                            <p className="text-gray-400 text-xs">พร้อมสำหรับแมตช์ถัดไป ({waitingToPlay.length})</p>
                        </div>
                        <div className="p-4 bg-white min-h-[100px]">
                            {waitingToPlay.length === 0 ? (
                                <p className="text-sm text-center py-6 text-gray-400 font-medium italic">ทุกคนกำลังตีอยู่ตอนนี้ 🏸</p>
                            ) : (
                                <div className="flex flex-wrap gap-2">
                                    {waitingToPlay.map(ep => (
                                        <div key={ep.id} className="flex items-center gap-2 p-2 rounded-xl bg-gray-50 border border-gray-100 hover:border-orange-200 transition-colors group">
                                            <div className="w-8 h-8 rounded-lg bg-gray-900 text-white flex items-center justify-center text-xs font-bold group-hover:bg-orange-500 transition-colors">
                                                {(ep.profiles as any)?.display_name?.charAt(0).toUpperCase()}
                                            </div>
                                            <span className="text-xs font-bold text-gray-700">{(ep.profiles as any)?.display_name}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Event Summary Stats */}
                <div className="card p-6 border-none shadow-xl bg-white">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-orange-50 text-orange-500">
                            <Icon icon="solar:info-square-bold-duotone" width={22} />
                        </div>
                        <h2 className="text-lg font-black tracking-tight" style={{ color: 'var(--gray-900)' }}>ข้อมูลก๊วนล่าสุด</h2>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mb-6">
                        <div className="p-4 rounded-2xl bg-gray-50 border border-gray-100">
                            <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">ผู้เล่นเช็คอิน</p>
                            <p className="text-xl font-black text-gray-900">{playerCount}<span className="text-xs ml-1 opacity-30">คน</span></p>
                        </div>
                        <div className="p-4 rounded-2xl bg-gray-50 border border-gray-100">
                            <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">แมตช์ทั้งหมด</p>
                            <p className="text-xl font-black text-gray-900">{matches.length}<span className="text-xs ml-1 opacity-30">เกม</span></p>
                        </div>
                    </div>

                    <div className="space-y-3">
                        {[
                            { label: 'ค่าสนามวันนี้', value: `฿${event.entry_fee}`, icon: 'solar:wad-of-money-bold-duotone', color: 'text-emerald-500' },
                            { label: 'ยี่ห้อลูกแบด', value: event.shuttlecock_brand, icon: 'solar:tag-bold-duotone', color: 'text-orange-500' },
                        ].map((item, i) => (
                            <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-gray-50/50 border border-gray-100">
                                <div className="flex items-center gap-3">
                                    <Icon icon={item.icon} width={18} className={item.color} />
                                    <span className="text-xs font-bold text-gray-500">{item.label}</span>
                                </div>
                                <span className="text-xs font-black text-gray-900">{item.value}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
