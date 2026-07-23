'use client';

import { useState, useEffect, useMemo, useEffect as useMount } from 'react';
import { createPortal } from 'react-dom';
import { createClient } from '@/src/lib/supabase/client';
import type { Event, Match, MatchPlayer, EventPlayer } from '@/src/types';
import Link from 'next/link';
import { Icon } from '@iconify/react';
import toast from 'react-hot-toast';
import { useConfirm } from '@/src/components/ConfirmProvider';
import { billedShuttleCount } from '@/src/lib/utils/billing';

export default function EventHistoryPage({ params }: { params: Promise<{ id: string }> }) {
    const [event, setEvent] = useState<Event | null>(null);
    const [matches, setMatches] = useState<Match[]>([]);
    const [eventPlayers, setEventPlayers] = useState<EventPlayer[]>([]);
    const [loading, setLoading] = useState(true);
    const [updatingPayment, setUpdatingPayment] = useState<string | null>(null);
    const [showPaymentSection, setShowPaymentSection] = useState(true);
    const [scoreMatch, setScoreMatch] = useState<Match | null>(null);
    const [winner, setWinner] = useState<'A' | 'B' | 'Draw' | 'None' | null>(null);
    const [mounted, setMounted] = useState(false);
    
    useEffect(() => {
        setMounted(true);
    }, []);

    // Reset winner when score modal opens/closes
    useEffect(() => {
        if (scoreMatch) setWinner(null);
    }, [scoreMatch]);

    const confirm = useConfirm();

    useEffect(() => {
        params.then((p) => loadData(p.id));
    }, [params]);

    const loadData = async (id: string) => {
        const supabase = createClient();
        const [eventRes, matchesRes, playersRes] = await Promise.all([
            supabase.from('events').select('*').eq('id', id).single(),
            supabase.from('matches').select('*, match_players(*, profiles(*))').eq('event_id', id).order('created_at', { ascending: true }),
            supabase.from('event_players').select('*, profiles(*)').eq('event_id', id),
        ]);
        if (eventRes.data) setEvent(eventRes.data as Event);
        if (matchesRes.data) setMatches(matchesRes.data as Match[]);
        if (playersRes.data) setEventPlayers(playersRes.data as EventPlayer[]);
        setLoading(false);
    };

    const userBills = useMemo(() => {
        if (!event) return {};
        const bills: Record<string, number> = {};

        eventPlayers.forEach(p => {
            let totalShuttleCost = 0;
            const myMatches = matches.filter(m =>
                (m.status === 'finished' || m.status === 'playing') &&
                m.match_players?.some(mp => mp.user_id === p.user_id)
            );

            myMatches.forEach(m => {
                // เกมที่เล่นแล้วนับอย่างน้อย 1 ลูก (เบิกเพิ่มนับตามจริง)
                totalShuttleCost += billedShuttleCount(m.shuttlecock_numbers) * (event.shuttlecock_price || 0);
            });

            const amount = (event.entry_fee || 0) + totalShuttleCost + (p.additional_cost || 0) - (p.discount || 0);
            bills[p.user_id] = Math.max(0, amount);
        });
        return bills;
    }, [eventPlayers, matches, event]);

    const allUsedShuttlecocks = useMemo(() => {
        const set = new Set<number>();
        matches.forEach(m => {
            if (m.shuttlecock_numbers) {
                m.shuttlecock_numbers.forEach((num: any) => set.add(Number(num)));
            }
        });
        return Array.from(set).sort((a, b) => a - b);
    }, [matches]);

    if (loading) return <div className="flex items-center justify-center py-20"><div className="spinner" style={{ width: 28, height: 28 }} /></div>;
    if (!event) return <div className="text-center py-20"><p style={{ color: 'var(--gray-500)' }}>ไม่พบข้อมูลก๊วน</p></div>;

    const finishedMatches = matches.filter(m => m.status === 'finished');
    const unfinishedMatches = matches.filter(m => m.status === 'playing' || m.status === 'waiting');
    const totalShuttlecocks = finishedMatches.reduce((sum: number, m: Match) => sum + billedShuttleCount(m.shuttlecock_numbers), 0);


    const togglePaymentStatus = async (ep: EventPlayer) => {
        if (!event?.id) return;

        const amount = userBills[ep.user_id] || 0;
        const msg = ep.payment_status === 'pending'
            ? `ยืนยันว่าได้รับเงิน จำนวน ฿${amount.toLocaleString()} จาก ${ep.profiles?.display_name} แล้ว?`
            : `เปลี่ยนสถานะของ ${ep.profiles?.display_name} เป็นยังไม่จ่ายเงิน?`;

        const ok = await confirm({
            title: 'ยืนยันการเปลี่ยนสถานะ',
            message: msg,
            type: ep.payment_status === 'pending' ? 'info' : 'warning',
            confirmText: 'ยืนยัน'
        });

        if (!ok) return;

        setUpdatingPayment(ep.user_id);
        const supabase = createClient();
        const newStatus = ep.payment_status === 'pending' ? 'paid' : 'pending';

        const { error } = await supabase.from('event_players').update({ payment_status: newStatus }).eq('id', ep.id);

        if (error) {
            toast.error('เกิดข้อผิดพลาด: ' + error.message);
        } else {
            toast.success('อัปเดตสถานะสำเร็จ');
            loadData(event.id);
        }
        setUpdatingPayment(null);
    };

    const submitScore = async () => {
        if (!scoreMatch) return;
        if (!winner) { toast.error('กรุณาเลือกผลการแข่งขัน'); return; }

        const isDraw = winner === 'Draw';
        const isNone = winner === 'None';
        const totalA = isNone ? 0 : (isDraw ? 1 : (winner === 'A' ? 1 : 0));
        const totalB = isNone ? 0 : (isDraw ? 1 : (winner === 'B' ? 1 : 0));

        const ok = await confirm({
            title: 'บันทึกคะแนน?',
            message: isNone ? 'ยืนยันการจบแมตช์โดยไม่แจ้งผลการแข่งขัน?' : (isDraw ? 'ยืนยันผลการแข่งขัน เสมอ?' : `ยืนยันผลการแข่งขัน ทีม ${winner} ชนะ?`),
            type: isNone ? 'warning' : 'info',
            confirmText: 'บันทึกคะแนน'
        });
        if (!ok) return;

        const supabase = createClient();
        await supabase.from('matches').update({
            status: 'finished',
            team_a_score: totalA,
            team_b_score: totalB,
        }).eq('id', scoreMatch.id);

        toast.success(isNone ? 'บันทึกสำเร็จ! (ไม่แจ้งผลแข่ง)' : (isDraw ? 'บันทึกสำเร็จ! เสมอ 🤝' : `บันทึกสำเร็จ! ทีม ${winner} ชนะ 🏆`));
        setScoreMatch(null);
        loadData(event.id);
    };

    return (
        <div className="animate-in max-w-4xl mx-auto">
            <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm mb-6 hover:text-orange-500 transition-colors" style={{ color: 'var(--gray-500)' }}>
                <Icon icon="solar:arrow-left-linear" width={16} /> กลับหน้าแรก
            </Link>

            {/* Event Header */}
            <div className="card mb-6 shadow-sm overflow-hidden" style={{ padding: 0 }}>
                <div className="bg-gradient-to-r from-gray-900 to-gray-800 p-6 relative">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-bl-full" />
                    <div className="relative z-10">
                        <div className="flex items-center gap-2 mb-2">
                            <span className="badge badge-muted text-[10px] bg-white/10 text-white border-white/20">ปิดแล้ว</span>
                        </div>
                        <h1 className="text-xl font-black text-white mb-1">
                            ก๊วนวันที่ {new Date(event.event_date).toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                        </h1>
                        <p className="text-sm text-gray-400">
                            {event.shuttlecock_brand} · ฿{event.shuttlecock_price}/ลูก · ค่าสนาม ฿{event.entry_fee}
                        </p>
                    </div>
                </div>

                {/* Quick Stats */}
                <div className="grid grid-cols-3 divide-x divide-gray-100 bg-white">
                    {[
                        { label: 'ผู้เล่น', value: `${eventPlayers.length} คน`, icon: 'solar:users-group-rounded-bold-duotone', color: 'text-blue-500' },
                        { label: 'แมตช์', value: `${finishedMatches.length} เกม`, icon: 'solar:gamepad-bold-duotone', color: 'text-emerald-500' },
                        { label: 'ลูกแบด', value: `${totalShuttlecocks} ลูก`, icon: 'solar:star-bold-duotone', color: 'text-amber-500' },
                    ].map((stat, i) => (
                        <div key={i} className="flex flex-col items-center justify-center p-4">
                            <Icon icon={stat.icon} width={22} className={stat.color + ' mb-1'} />
                            <p className="text-lg font-black text-gray-900">{stat.value}</p>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{stat.label}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* Extended Summary */}
            <div className="flex flex-wrap items-center gap-2 mb-6">
                {Array.from(allUsedShuttlecocks).length > 0 && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-orange-50 border border-orange-100">
                        <Icon icon="solar:shuttlecock-linear" width={16} className="text-orange-500" />
                        <span className="text-xs font-semibold text-orange-700">ใช้ {Array.from(allUsedShuttlecocks).length} ลูก</span>
                        <div className="flex items-center gap-1 ml-1 border-l border-orange-200 pl-2">
                            {Array.from(allUsedShuttlecocks).slice(0, 5).map(num => (
                                <span key={num} className="text-[10px] font-bold bg-white text-orange-600 px-1 py-0.5 rounded shadow-sm">
                                    {num}
                                </span>
                            ))}
                            {Array.from(allUsedShuttlecocks).length > 5 && (
                                <span className="text-[10px] font-bold text-orange-500">+{Array.from(allUsedShuttlecocks).length - 5}</span>
                            )}
                        </div>
                    </div>
                )}
                {eventPlayers.filter(p => p.is_substitute).length > 0 && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg" style={{ background: '#3b82f615', border: '1px solid #3b82f630' }}>
                        <Icon icon="solar:user-hand-up-linear" width={16} style={{ color: '#3b82f6' }} />
                        <span className="text-xs font-semibold" style={{ color: '#2563eb' }}>
                            {eventPlayers.filter(p => p.is_substitute).length} สำรอง
                        </span>
                    </div>
                )}
            </div>

            {/* Players */}
            <div className="card mb-6 shadow-sm" style={{ padding: '20px 24px' }}>
                <h2 className="text-sm font-black mb-3 tracking-tight uppercase text-gray-400">รายชื่อผู้เล่น</h2>
                <div className="flex flex-wrap gap-2">
                    {eventPlayers.map((ep) => (
                        <div key={ep.id} className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-50 border border-gray-100">
                            <div className="w-6 h-6 rounded-full bg-orange-500 text-white flex items-center justify-center text-[10px] font-bold">
                                {ep.profiles?.display_name?.charAt(0).toUpperCase()}
                            </div>
                            <span className="text-xs font-bold text-gray-700">{ep.profiles?.display_name}</span>
                            {ep.profiles?.is_guest && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md" style={{ background: '#f9731620', color: '#f97316' }}>
                                    ขาจร
                                </span>
                            )}
                            {ep.is_substitute && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md" style={{ background: '#3b82f620', color: '#3b82f6' }}>
                                    สำรอง
                                </span>
                            )}
                            {ep.payment_status === 'paid' && (
                                <Icon icon="solar:check-circle-bold" width={14} className="text-emerald-500" />
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Payment Section */}
            {
                eventPlayers.length > 0 && (
                    <div className="card mb-6 shadow-sm" style={{ padding: 0, overflow: 'hidden' }}>
                        <button
                            onClick={() => setShowPaymentSection(!showPaymentSection)}
                            className="w-full flex items-center justify-between px-5 py-4 transition-colors hover:bg-gray-50"
                            style={{ borderBottom: showPaymentSection ? '1px solid var(--gray-200)' : 'none' }}
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(22,163,74,0.06)' }}>
                                    <Icon icon="solar:wallet-money-linear" width={20} style={{ color: 'var(--success)' }} />
                                </div>
                                <div className="text-left">
                                    <p className="text-sm font-bold" style={{ color: 'var(--gray-900)' }}>สถานะการจ่ายเงิน (อัปเดตย้อนหลังได้)</p>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <p className="text-xs" style={{ color: 'var(--gray-500)' }}>
                                            จ่ายแล้ว {eventPlayers.filter(p => p.payment_status === 'paid').length}/{eventPlayers.length} คน
                                        </p>
                                        <span className="text-xs font-semibold px-2 py-0.5 rounded-md" style={{ background: 'rgba(22,163,74,0.1)', color: 'var(--success)' }}>
                                            ยอดเก็บแล้ว ฿{eventPlayers.reduce((sum, p) => sum + (p.payment_status === 'paid' ? (userBills[p.user_id] || 0) : 0), 0).toLocaleString()}
                                        </span>
                                        <span className="text-xs font-semibold px-2 py-0.5 rounded-md" style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6' }}>
                                            ยอดทั้งหมด ฿{eventPlayers.reduce((sum, p) => sum + (userBills[p.user_id] || 0), 0).toLocaleString()}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {eventPlayers.filter(p => p.payment_status === 'pending').length > 0 && (
                                    <span className="badge badge-warning">
                                        ค้าง {eventPlayers.filter(p => p.payment_status === 'pending').length}
                                    </span>
                                )}
                                <Icon icon={showPaymentSection ? 'solar:alt-arrow-up-linear' : 'solar:alt-arrow-down-linear'} width={18} style={{ color: 'var(--gray-400)' }} />
                            </div>
                        </button>

                        {showPaymentSection && (
                            <div>
                                {/* Sort: pending first, then paid */}
                                {[...eventPlayers]
                                    .sort((a, b) => {
                                        if (a.payment_status !== b.payment_status) return a.payment_status === 'pending' ? -1 : 1;
                                        return 0;
                                    })
                                    .map((ep, index) => {
                                        const isPaid = ep.payment_status === 'paid';
                                        const isUpdating = updatingPayment === ep.user_id;
                                        return (
                                            <div
                                                key={ep.id}
                                                className="flex items-center justify-between px-5 py-3 transition-colors hover:bg-gray-50/50"
                                                style={{
                                                    borderBottom: index < eventPlayers.length - 1 ? '1px solid var(--gray-100)' : 'none',
                                                    background: isPaid ? 'rgba(22, 163, 74, 0.02)' : 'transparent',
                                                }}
                                            >
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <div
                                                        className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                                                        style={{ background: 'var(--gray-900)', color: 'var(--white)' }}
                                                    >
                                                        {ep.profiles?.display_name?.charAt(0)?.toUpperCase()}
                                                    </div>
                                                    <p className="text-sm font-medium truncate" style={{ color: 'var(--gray-900)' }}>{ep.profiles?.display_name}</p>
                                                </div>
                                                <div className="flex items-center gap-2 shrink-0 ml-2">
                                                    <span className="text-sm font-bold" style={{ color: 'var(--gray-700)' }}>
                                                        ฿{(userBills[ep.user_id] || 0).toLocaleString()}
                                                    </span>
                                                    <span className={`badge ${isPaid ? 'badge-success' : 'badge-warning'}`}>
                                                        {isPaid ? 'จ่ายแล้ว' : 'ยังไม่จ่าย'}
                                                    </span>
                                                    <button
                                                        disabled={isUpdating}
                                                        onClick={() => togglePaymentStatus(ep)}
                                                        className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors ml-1 disabled:opacity-50"
                                                        style={{
                                                            background: isPaid ? 'transparent' : 'var(--orange-500)',
                                                            color: isPaid ? 'var(--gray-400)' : 'white',
                                                            border: isPaid ? '1px solid var(--gray-200)' : 'none'
                                                        }}
                                                    >
                                                        {isUpdating ? (
                                                            <div className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
                                                        ) : isPaid ? (
                                                            <Icon icon="solar:close-circle-bold" width={18} />
                                                        ) : (
                                                            <Icon icon="solar:check-circle-bold" width={18} />
                                                        )}
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                            </div>
                        )}
                    </div>
                )
            }

            {/* Unfinished Matches */}
            {unfinishedMatches.length > 0 && (
                <div className="card shadow-sm mb-6 border border-orange-200" style={{ padding: '20px 24px', background: 'var(--orange-50)' }}>
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-sm font-black tracking-tight" style={{ color: 'var(--orange-600)' }}>
                            <Icon icon="solar:clock-circle-bold-duotone" width={16} className="inline-block mr-1.5 align-text-bottom" />
                            แมตช์ที่ยังไม่จบ ({unfinishedMatches.length})
                        </h2>
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-600">ก๊วนจบแล้ว แต่ยังมีแมตช์ค้าง</span>
                    </div>
                    
                    <div className="space-y-3">
                        {unfinishedMatches.map((match, idx) => {
                            const teamA = match.match_players?.filter(mp => mp.team === 'A') || [];
                            const teamB = match.match_players?.filter(mp => mp.team === 'B') || [];
                            
                            return (
                                <div key={match.id} className="rounded-xl border border-orange-200 bg-white overflow-hidden">
                                    <div className="flex items-center justify-between px-4 py-2 bg-orange-50/50 border-b border-orange-100">
                                        <span className="text-xs font-bold text-orange-500">สนาม {match.court_number} · สถานะ: {match.status === 'playing' ? 'กำลังตี' : 'รอคิว'}</span>
                                        {match.shuttlecock_numbers && match.shuttlecock_numbers.length > 0 && (
                                            <span className="text-[10px] font-bold text-orange-400">
                                                🏸 ลูก #{match.shuttlecock_numbers.join(', #')}
                                            </span>
                                        )}
                                    </div>
                                    <div className="p-4">
                                        <div className="flex items-center justify-between gap-4">
                                            {/* Team A */}
                                            <div className="w-[40%]">
                                                <div className="flex items-center gap-1.5 mb-2">
                                                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--orange-500)' }} />
                                                    <span className="text-[10px] font-black tracking-wider uppercase text-gray-400">Team A</span>
                                                </div>
                                                <div className="space-y-1.5">
                                                    {teamA.map((mp, i) => (
                                                        <div key={mp.id} className="flex items-center gap-2">
                                                            <span className="text-xs font-bold text-gray-700 truncate">
                                                                {mp.profiles?.display_name || 'ไม่ทราบชื่อ'}
                                                            </span>
                                                        </div>
                                                    ))}
                                                    {Array.from({ length: Math.max(0, 2 - teamA.length) }).map((_, i) => (
                                                        <span key={`empty-A-${i}`} className="text-xs font-bold text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full italic opacity-70">
                                                            (ขาจร)
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* VS center and End Button */}
                                            <div className="w-[20%] text-center flex flex-col items-center justify-center gap-2">
                                                <span className="text-[10px] font-black text-gray-300 italic">VS</span>
                                                <button
                                                    onClick={() => setScoreMatch(match)}
                                                    className="w-full py-1.5 rounded bg-orange-500 hover:bg-orange-600 text-white text-[10px] font-bold transition-colors shadow-sm"
                                                >
                                                    จบแมตช์
                                                </button>
                                            </div>

                                            {/* Team B */}
                                            <div className="w-[40%] text-right">
                                                <div className="flex items-center justify-end gap-1.5 mb-2">
                                                    <span className="text-[10px] font-black tracking-wider uppercase text-gray-400">Team B</span>
                                                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#3b82f6' }} />
                                                </div>
                                                <div className="space-y-1.5">
                                                    {teamB.map((mp, i) => (
                                                        <div key={mp.id} className="flex items-center justify-end gap-2">
                                                            <span className="text-xs font-bold text-gray-700 truncate">
                                                                {mp.profiles?.display_name || 'ไม่ทราบชื่อ'}
                                                            </span>
                                                        </div>
                                                    ))}
                                                    {Array.from({ length: Math.max(0, 2 - teamB.length) }).map((_, i) => (
                                                        <span key={`empty-B-${i}`} className="text-xs font-bold text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full italic opacity-70">
                                                            (ขาจร)
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Match Results */}
            <div className="card shadow-sm mb-16" style={{ padding: '20px 24px' }}>
                <h2 className="text-sm font-black mb-4 tracking-tight uppercase text-gray-400">ผลการแข่งขัน</h2>
                {finishedMatches.length === 0 ? (
                    <div className="text-center py-8">
                        <Icon icon="solar:gamepad-bold-duotone" width={32} className="text-gray-300 mx-auto mb-2" />
                        <p className="text-sm text-gray-400">ไม่มีแมตช์ที่ตีจบ</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {finishedMatches.map((match, idx) => {
                            const teamA = match.match_players?.filter(mp => mp.team === 'A') || [];
                            const teamB = match.match_players?.filter(mp => mp.team === 'B') || [];
                            const aWins = match.team_a_score > match.team_b_score;

                            return (
                                <div key={match.id} className="rounded-xl border border-gray-100 overflow-hidden">
                                    {/* Match Header */}
                                    <div className="flex items-center justify-between px-4 py-2 bg-gray-50/80 border-b border-gray-100">
                                        <span className="text-xs font-bold text-gray-400">เกม #{idx + 1} · สนาม {match.court_number}</span>
                                        {match.shuttlecock_numbers && match.shuttlecock_numbers.length > 0 && (
                                            <span className="text-[10px] font-bold text-gray-400">
                                                🏸 ลูก #{match.shuttlecock_numbers.join(', #')}
                                            </span>
                                        )}
                                    </div>

                                    {/* Score */}
                                    <div className="p-4">
                                        <div className="flex items-center justify-between gap-4">
                                            {/* Team A */}
                                            <div className={`flex-1 text-center ${aWins ? '' : 'opacity-60'}`}>
                                                <div className="flex flex-wrap items-center justify-center gap-1 mb-2">
                                                    {teamA.map(mp => (
                                                        <span key={mp.id} className="text-xs font-bold text-gray-700 bg-gray-100 px-2 py-0.5 rounded-full">
                                                            {mp.profiles?.display_name}
                                                        </span>
                                                    ))}
                                                    {Array.from({ length: Math.max(0, 2 - teamA.length) }).map((_, idx) => (
                                                        <span key={`empty-A-${idx}`} className="text-xs font-bold text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full italic opacity-70">
                                                            (ขาจร)
                                                        </span>
                                                    ))}
                                                </div>
                                                <span className={`text-2xl font-black ${aWins ? 'text-emerald-500' : 'text-gray-400'}`}>
                                                    {match.team_a_score}
                                                </span>
                                                {aWins && <span className="block text-[10px] font-bold text-emerald-500 mt-0.5">ชนะ</span>}
                                            </div>

                                            <span className="text-sm font-black text-gray-300">VS</span>

                                            {/* Team B */}
                                            <div className={`flex-1 text-center ${!aWins ? '' : 'opacity-60'}`}>
                                                <div className="flex flex-wrap items-center justify-center gap-1 mb-2">
                                                    {teamB.map(mp => (
                                                        <span key={mp.id} className="text-xs font-bold text-gray-700 bg-gray-100 px-2 py-0.5 rounded-full">
                                                            {mp.profiles?.display_name}
                                                        </span>
                                                    ))}
                                                    {Array.from({ length: Math.max(0, 2 - teamB.length) }).map((_, idx) => (
                                                        <span key={`empty-B-${idx}`} className="text-xs font-bold text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full italic opacity-70">
                                                            (ขาจร)
                                                        </span>
                                                    ))}
                                                </div>
                                                <span className={`text-2xl font-black ${!aWins ? 'text-emerald-500' : 'text-gray-400'}`}>
                                                    {match.team_b_score}
                                                </span>
                                                {!aWins && <span className="block text-[10px] font-bold text-emerald-500 mt-0.5">ชนะ</span>}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {mounted && scoreMatch && createPortal(
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm" onClick={() => setScoreMatch(null)} />
                    <div className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                        {/* Header */}
                        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between" style={{ background: 'var(--white)' }}>
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-2xl flex items-center justify-center shadow-sm" style={{ background: 'var(--orange-50)', color: 'var(--orange-500)' }}>
                                    <Icon icon="solar:cup-star-bold-duotone" width={24} />
                                </div>
                                <div>
                                    <h3 className="text-lg font-black" style={{ color: 'var(--gray-900)' }}>บันทึกผลการแข่ง</h3>
                                    <p className="text-xs font-medium" style={{ color: 'var(--gray-500)' }}>
                                        สนาม {scoreMatch.court_number}
                                    </p>
                                </div>
                            </div>
                            <button onClick={() => setScoreMatch(null)} className="w-8 h-8 flex items-center justify-center rounded-xl bg-gray-50 text-gray-400 hover:text-gray-600 transition-colors">
                                <Icon icon="solar:close-circle-bold" width={20} />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="p-6">
                            <p className="text-[13px] font-bold text-center mb-6" style={{ color: 'var(--gray-600)' }}>
                                กรุณาเลือกทีมที่ชนะในแมตช์นี้
                            </p>
                            <div className="grid grid-cols-2 gap-3 mb-3">
                                <button
                                    onClick={() => setWinner('A')}
                                    className="flex flex-col items-center gap-3 p-4 rounded-2xl transition-all relative overflow-hidden group"
                                    style={{
                                        background: winner === 'A' ? 'var(--orange-500)' : 'var(--white)',
                                        border: `2px solid ${winner === 'A' ? 'var(--orange-500)' : 'var(--gray-200)'}`,
                                        color: winner === 'A' ? 'var(--white)' : 'var(--gray-900)',
                                    }}
                                >
                                    <div className="absolute -right-4 -top-4 w-16 h-16 rounded-full opacity-10" style={{ background: 'var(--white)' }} />
                                    <div className="w-12 h-12 rounded-full flex items-center justify-center shadow-sm" style={{
                                        background: winner === 'A' ? 'rgba(255,255,255,0.2)' : 'var(--orange-50)',
                                        color: winner === 'A' ? 'var(--white)' : 'var(--orange-500)',
                                    }}>
                                        <Icon icon="solar:user-hands-bold-duotone" width={28} />
                                    </div>
                                    <div className="text-center">
                                        <span className="block text-[10px] font-black uppercase tracking-wider mb-0.5 opacity-80">ผู้ชนะ</span>
                                        <span className="text-base font-black">ทีม A</span>
                                    </div>
                                </button>
                                <button
                                    onClick={() => setWinner('B')}
                                    className="flex flex-col items-center gap-3 p-4 rounded-2xl transition-all relative overflow-hidden group"
                                    style={{
                                        background: winner === 'B' ? '#3b82f6' : 'var(--white)',
                                        border: `2px solid ${winner === 'B' ? '#3b82f6' : 'var(--gray-200)'}`,
                                        color: winner === 'B' ? 'var(--white)' : 'var(--gray-900)',
                                    }}
                                >
                                    <div className="absolute -right-4 -top-4 w-16 h-16 rounded-full opacity-10" style={{ background: 'var(--white)' }} />
                                    <div className="w-12 h-12 rounded-full flex items-center justify-center shadow-sm" style={{
                                        background: winner === 'B' ? 'rgba(255,255,255,0.2)' : 'rgba(59,130,246,0.1)',
                                        color: winner === 'B' ? 'var(--white)' : '#3b82f6',
                                    }}>
                                        <Icon icon="solar:user-hands-bold-duotone" width={28} />
                                    </div>
                                    <div className="text-center">
                                        <span className="block text-[10px] font-black uppercase tracking-wider mb-0.5 opacity-80">ผู้ชนะ</span>
                                        <span className="text-base font-black">ทีม B</span>
                                    </div>
                                </button>
                            </div>
                            <div className="grid grid-cols-2 gap-3 mb-6">
                                <button
                                    onClick={() => setWinner('Draw')}
                                    className="p-3 rounded-xl transition-all flex items-center justify-center gap-2"
                                    style={{
                                        background: winner === 'Draw' ? 'var(--gray-900)' : 'var(--white)',
                                        border: `2px solid ${winner === 'Draw' ? 'var(--gray-900)' : 'var(--gray-200)'}`,
                                        color: winner === 'Draw' ? 'var(--white)' : 'var(--gray-700)',
                                    }}
                                >
                                    <Icon icon="solar:handshake-bold-duotone" width={18} />
                                    <span className="text-sm font-black">เสมอ</span>
                                </button>
                                <button
                                    onClick={() => setWinner('None')}
                                    className="p-3 rounded-xl transition-all flex items-center justify-center gap-2"
                                    style={{
                                        background: winner === 'None' ? 'var(--gray-600)' : 'var(--white)',
                                        border: `2px solid ${winner === 'None' ? 'var(--gray-600)' : 'var(--gray-200)'}`,
                                        color: winner === 'None' ? 'var(--white)' : 'var(--gray-700)',
                                    }}
                                >
                                    <span className="text-sm font-black">ไม่ระบุผล</span>
                                    <Icon icon="solar:question-circle-bold-duotone" width={18} />
                                </button>
                            </div>
                            <div className="border-t border-gray-100 pt-6">
                                <button
                                    onClick={submitScore}
                                    disabled={!winner}
                                    className="btn btn-primary w-full shadow-lg"
                                >
                                    บันทึกผลการแข่งขัน
                                </button>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
