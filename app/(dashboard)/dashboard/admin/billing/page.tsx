'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/src/lib/supabase/client';
import type { Event, EventPlayer, Profile } from '@/src/types';
import toast from 'react-hot-toast';
import { useConfirm } from '@/src/components/ConfirmProvider';
import { Icon } from '@iconify/react';
import { truncateName } from '@/src/lib/string-utils';


interface PlayerBill {
    eventPlayerId: string;
    userId: string;
    displayName: string;
    gamesPlayed: number;
    amount: number; // Current Pending for selected period
    totalOwed?: number; // Grand Total for selected period
    totalPaid?: number; // Total Paid for selected period
    paymentStatus: 'pending' | 'paid';
    slipUrl: string | null;
    shuttlecockNums?: string;
    shuttlecockCount?: number;
    eventDate?: string;
}

export default function AdminBillingPage() {
    const [events, setEvents] = useState<Event[]>([]);
    const [selectedEventId, setSelectedEventId] = useState<string>('');
    const [selectedMonth, setSelectedMonth] = useState<string>('all'); // YYYY-MM or 'all'
    const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
    const [bills, setBills] = useState<PlayerBill[]>([]);
    const [loading, setLoading] = useState(true);
    const [viewingSlip, setViewingSlip] = useState<string | null>(null);
    const [historyUser, setHistoryUser] = useState<{ id: string; name: string } | null>(null);
    const [historyData, setHistoryData] = useState<any[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const confirm = useConfirm();
    const [eventDropdownOpen, setEventDropdownOpen] = useState(false);
    const [monthDropdownOpen, setMonthDropdownOpen] = useState(false);
    const eventDropdownRef = useRef<HTMLDivElement>(null);
    const monthDropdownRef = useRef<HTMLDivElement>(null);

    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 20;

    // Close dropdowns on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (eventDropdownRef.current && !eventDropdownRef.current.contains(e.target as Node)) setEventDropdownOpen(false);
            if (monthDropdownRef.current && !monthDropdownRef.current.contains(e.target as Node)) setMonthDropdownOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // Generate unique months from events for the filter
    const availableMonths = Array.from(new Set(events.map(e => e.event_date.substring(0, 7)))).sort().reverse();

    useEffect(() => {
        loadEvents();
    }, []);

    const loadEvents = async () => {
        const supabase = createClient();
        const { data: profile } = await supabase.from('profiles').select('role').eq('id', (await supabase.auth.getUser()).data.user!.id).single();
        if (profile?.role !== 'admin') return;

        const { data } = await supabase.from('events').select('*').order('event_date', { ascending: false });
        if (data) {
            setEvents(data as Event[]);
            // Default to today's event
            const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local timezone
            const todayEvent = (data as Event[]).find((e) => e.event_date === today);
            if (todayEvent) {
                setSelectedEventId(todayEvent.id);
            } else if (data.length > 0) {
                setSelectedEventId((data[0] as Event).id);
            }
        }
        setLoading(false);
    };

    const loadBills = useCallback(async () => {
        if (!selectedEventId) return;
        setLoading(true);
        const supabase = createClient();

        try {
            if (selectedEventId === 'all') {
                setSelectedEvent(null);
                const { data: allEP } = await supabase.from('event_players').select('*, profiles(*), events(*)');
                if (!allEP) { setLoading(false); return; }

                const { data: allMP } = await supabase
                    .from('match_players')
                    .select('*, matches!inner(id, event_id, status, shuttlecock_numbers)');

                const matchDetails: Record<string, { gamesPlayed: number; shuttlecocks: string[]; shuttlecockCost: number }> = {};
                if (allMP) {
                    const matchPlayerCounts: Record<string, number> = {};
                    allMP.forEach(mp => {
                        matchPlayerCounts[mp.match_id] = (matchPlayerCounts[mp.match_id] || 0) + 1;
                    });

                    allMP.forEach(mp => {
                        const mStatus = mp.matches?.status;
                        if (mStatus !== 'finished' && mStatus !== 'playing') return;

                        const key = `${mp.user_id}_${mp.matches.event_id}`;
                        if (!matchDetails[key]) matchDetails[key] = { gamesPlayed: 0, shuttlecocks: [], shuttlecockCost: 0 };

                        matchDetails[key].gamesPlayed += 1;
                        const matchObj = Array.isArray(mp.matches) ? mp.matches[0] : mp.matches;
                        if (matchObj?.shuttlecock_numbers) {
                            const nums = matchObj.shuttlecock_numbers.map((s: string) => s.trim()).filter(Boolean);
                            matchDetails[key].shuttlecocks.push(...nums);
                            const matchPCount = matchPlayerCounts[mp.match_id] || 4;
                            matchDetails[key].shuttlecockCost += nums.length / matchPCount;
                        }
                    });
                }

                const userSummary: Record<string, PlayerBill & { totalOwed: number, totalPaid: number, shuttlecocks: string[] }> = {};
                for (const ep of allEP as any[]) {
                    const eventDate = ep.events?.event_date;
                    if (selectedMonth !== 'all' && eventDate && !eventDate.startsWith(selectedMonth)) continue;

                    const uid = ep.user_id;
                    const event = ep.events;
                    const eventId = event?.id;
                    const detail = matchDetails[`${uid}_${eventId}`] || { gamesPlayed: 0, shuttlecocks: [], shuttlecockCost: 0 };

                    // Cost calculation similar to matches page
                    const amount = Math.ceil((event?.entry_fee || 0) + ((event?.shuttlecock_price || 0) * detail.shuttlecockCost)) + (ep.additional_cost || 0) - (ep.discount || 0);

                    const billKey = `${uid}_${eventId}`; // Keep separate bill per event per user

                    if (!userSummary[billKey]) {
                        userSummary[billKey] = {
                            eventPlayerId: ep.id,
                            userId: uid,
                            displayName: ep.profiles?.display_name || 'ไม่ทราบชื่อ',
                            gamesPlayed: 0,
                            amount: 0,
                            totalOwed: 0,
                            totalPaid: 0,
                            paymentStatus: ep.payment_status,
                            slipUrl: ep.slip_url,
                            shuttlecocks: [],
                            eventDate: eventDate
                        };
                    }

                    userSummary[billKey].gamesPlayed += detail.gamesPlayed;
                    userSummary[billKey].totalOwed += amount;
                    userSummary[billKey].shuttlecocks.push(...detail.shuttlecocks);

                    if (ep.payment_status === 'pending') {
                        userSummary[billKey].amount += amount;
                    } else {
                        userSummary[billKey].totalPaid += amount;
                    }
                }

                const aggregatedBills = Object.values(userSummary).map(u => {
                    return {
                        ...u,
                        shuttlecockCount: u.shuttlecocks.length,
                        shuttlecockNums: u.shuttlecocks.join(', ')
                    };
                }).filter(b => b.totalOwed > 0 || b.gamesPlayed > 0);

                aggregatedBills.sort((a, b) => {
                    // Primary sort by date descending
                    const dateA = new Date(a.eventDate || '').getTime();
                    const dateB = new Date(b.eventDate || '').getTime();
                    if (dateA !== dateB) return dateB - dateA;

                    // Secondary sort by payment status
                    if (a.paymentStatus !== b.paymentStatus) return a.paymentStatus === 'pending' ? -1 : 1;
                    return b.amount - a.amount;
                });
                setBills(aggregatedBills);
            } else {
                const event = events.find((e) => e.id === selectedEventId);
                setSelectedEvent(event || null);

                const { data: eventPlayers } = await supabase.from('event_players').select('*, profiles(*)').eq('event_id', selectedEventId);
                if (!eventPlayers) { setLoading(false); return; }

                const { data: matchData } = await supabase
                    .from('match_players')
                    .select('user_id, match_id, matches!inner(id, status, shuttlecock_numbers)')
                    .eq('matches.event_id', selectedEventId);

                const matchPlayerCounts: Record<string, number> = {};
                (matchData || []).forEach(m => {
                    matchPlayerCounts[m.match_id] = (matchPlayerCounts[m.match_id] || 0) + 1;
                });

                const userMatchDetails: Record<string, { games: number; shuttlecocks: string[]; shuttlecockCost: number }> = {};
                (matchData || []).forEach(m => {
                    const matchArr = Array.isArray(m.matches) ? m.matches : [m.matches];
                    const matchObj = matchArr[0];
                    if (!matchObj) return;

                    const mStatus = matchObj.status;
                    if (mStatus !== 'finished' && mStatus !== 'playing') return;

                    const uid = m.user_id;
                    if (!userMatchDetails[uid]) userMatchDetails[uid] = { games: 0, shuttlecocks: [], shuttlecockCost: 0 };

                    userMatchDetails[uid].games += 1;
                    if (matchObj?.shuttlecock_numbers) {
                        const nums = matchObj.shuttlecock_numbers.map((s: string) => s.trim()).filter(Boolean);
                        userMatchDetails[uid].shuttlecocks.push(...nums);
                        const matchPCount = matchPlayerCounts[m.match_id] || 4;
                        userMatchDetails[uid].shuttlecockCost += nums.length / matchPCount;
                    }
                });

                const playerBills: PlayerBill[] = (eventPlayers as any[]).map(ep => {
                    const detail = userMatchDetails[ep.user_id] || { games: 0, shuttlecocks: [], shuttlecockCost: 0 };
                    const amount = Math.ceil((event?.entry_fee || 0) + ((event?.shuttlecock_price || 0) * detail.shuttlecockCost)) + (ep.additional_cost || 0) - (ep.discount || 0);
                    return {
                        eventPlayerId: ep.id,
                        userId: ep.user_id,
                        displayName: ep.profiles?.display_name || 'ไม่ทราบชื่อ',
                        gamesPlayed: detail.games,
                        amount,
                        paymentStatus: ep.payment_status,
                        slipUrl: ep.slip_url,
                        shuttlecockCount: detail.shuttlecocks.length,
                        shuttlecockNums: detail.shuttlecocks.join(', ')
                    };
                });

                playerBills.sort((a, b) => {
                    if (a.paymentStatus !== b.paymentStatus) return a.paymentStatus === 'pending' ? -1 : 1;
                    return b.amount - a.amount;
                });
                setBills(playerBills);
            }
        } catch (err) {
            console.error(err);
            toast.error('ไม่สามารถโหลดข้อมูลการเงินได้');
        } finally {
            setLoading(false);
        }
    }, [selectedEventId, events, selectedMonth]);

    const loadPlayerHistory = async (userId: string, displayName: string) => {
        setHistoryUser({ id: userId, name: displayName });
        setLoadingHistory(true);
        const supabase = createClient();

        try {
            const { data: epData } = await supabase
                .from('event_players')
                .select('*, events(*)')
                .eq('user_id', userId)
                .order('created_at', { ascending: false });

            const { data: mpData } = await supabase
                .from('match_players')
                .select('*, matches!inner(id, event_id, status, shuttlecock_numbers)')
                .eq('user_id', userId);

            const matchDetails: Record<string, { games: number; shuttlecocks: string[] }> = {};
            (mpData || []).forEach(mp => {
                const mStatus = mp.matches?.status;
                if (mStatus !== 'finished' && mStatus !== 'playing') return;

                const eid = mp.matches.event_id;
                if (!matchDetails[eid]) matchDetails[eid] = { games: 0, shuttlecocks: [] };

                matchDetails[eid].games += 1;
                const matchObj = Array.isArray(mp.matches) ? mp.matches[0] : mp.matches;
                if (matchObj?.shuttlecock_numbers) {
                    const nums = matchObj.shuttlecock_numbers.map((s: string) => s.trim()).filter(Boolean);
                    matchDetails[eid].shuttlecocks.push(...nums);
                }
            });

            const history = (epData || []).map((ep: any) => {
                const detail = matchDetails[ep.event_id] || { games: 0, shuttlecocks: [] };
                const amount = (ep.events?.entry_fee || 0) + ((ep.events?.shuttlecock_price || 0) * detail.shuttlecocks.length);

                return {
                    id: ep.id,
                    eventId: ep.event_id,
                    eventDate: ep.events?.event_date || '',
                    amount,
                    status: ep.payment_status,
                    slipUrl: ep.slip_url,
                    games: detail.games,
                    shuttlecockCount: detail.shuttlecocks.length,
                    shuttlecockNums: detail.shuttlecocks.join(', ')
                };
            });

            setHistoryData(history);
        } catch (err) {
            console.error(err);
            toast.error('ไม่สามารถโหลดประวัติได้');
        } finally {
            setLoadingHistory(false);
        }
    };

    useEffect(() => {
        if (selectedEventId) {
            setCurrentPage(1);
            loadBills();
        }
    }, [selectedEventId, selectedMonth, loadBills]);

    const togglePayment = async (bill: PlayerBill) => {
        const newStatus = bill.paymentStatus === 'paid' ? 'pending' : 'paid';
        const ok = await confirm({
            title: newStatus === 'paid' ? 'ยืนยันการชำระเงิน?' : 'ยกเลิกการชำระเงิน?',
            message: newStatus === 'paid'
                ? `ต้องการบันทึกว่า ${bill.displayName} ชำระเงินจำนวน ฿${bill.amount.toFixed(0)} แล้วใช่หรือไม่?`
                : `ต้องการเปลี่ยนสถานะของ ${bill.displayName} เป็นยังไม่ได้ชำระเงินใช่หรือไม่?`,
            type: newStatus === 'paid' ? 'info' : 'warning',
            confirmText: newStatus === 'paid' ? 'ยืนยันชำระเงิน' : 'ยืนยันยกเลิก'
        });

        if (!ok) return;

        const supabase = createClient();
        const { error } = await supabase
            .from('event_players')
            .update({ payment_status: newStatus })
            .eq('id', bill.eventPlayerId);

        if (error) {
            toast.error('อัปเดตไม่สำเร็จ');
        } else {
            toast.success(newStatus === 'paid' ? 'บันทึกว่าจ่ายแล้ว' : 'เปลี่ยนสถานะเป็นยังไม่จ่าย');
            loadBills();
        }
    };

    if (loading) return <div className="flex items-center justify-center py-20"><div className="spinner" style={{ width: 28, height: 28 }} /></div>;

    const totalPending = bills.filter((b) => b.paymentStatus === 'pending').reduce((s, b) => s + b.amount, 0);
    const totalPaid = selectedEventId === 'all'
        ? (bills as any[]).reduce((s, b) => s + (b.totalPaid || 0), 0)
        : bills.filter((b) => b.paymentStatus === 'paid').reduce((s, b) => s + b.amount, 0);
    const totalOwed = selectedEventId === 'all'
        ? (bills as any[]).reduce((s, b) => s + (b.totalOwed || 0), 0)
        : bills.reduce((s, b) => s + b.amount, 0);

    const paidCount = bills.filter((b) => b.paymentStatus === 'paid').length;
    const pendingCount = bills.filter((b) => b.paymentStatus === 'pending').length;

    // Pagination Calculation
    const totalPages = Math.ceil(bills.length / ITEMS_PER_PAGE);
    const paginatedBills = bills.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

    return (
        <>
            <div className="animate-in grid grid-cols-1 lg:grid-cols-12 gap-6 pb-12">
                {/* Header */}
                <div className="col-span-1 lg:col-span-12 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-2">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm" style={{ background: 'var(--orange-500)' }}>
                            <Icon icon="solar:wallet-money-bold-duotone" width={24} style={{ color: 'var(--white)' }} />
                        </div>
                        <div>
                            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight" style={{ color: 'var(--gray-900)' }}>จัดการเงิน</h1>
                            <p className="text-sm font-medium mt-0.5" style={{ color: 'var(--gray-500)' }}>
                                {selectedEventId === 'all'
                                    ? (selectedMonth === 'all' ? 'สรุปยอดค้างสะสมทั้งหมด' : `สรุปยอดค้างประจำเดือน ${new Date(selectedMonth + '-01').toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })}`)
                                    : 'สรุปรายได้และสถานะการชำระเงินประจำวัน'}
                            </p>
                        </div>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                        <style>{`
                            @keyframes billingDropIn {
                                from { opacity: 0; transform: translateY(-6px); }
                                to { opacity: 1; transform: translateY(0); }
                            }
                        `}</style>

                        {/* Month Filter Dropdown */}
                        {selectedEventId === 'all' && (
                            <div className="relative" ref={monthDropdownRef}>
                                <button
                                    onClick={() => { setMonthDropdownOpen(!monthDropdownOpen); setEventDropdownOpen(false); }}
                                    className="flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all whitespace-nowrap"
                                    style={{
                                        background: 'var(--white)',
                                        border: `1.5px solid ${monthDropdownOpen ? 'var(--orange-500)' : 'var(--gray-200)'}`,
                                        color: 'var(--gray-900)',
                                        boxShadow: monthDropdownOpen ? '0 0 0 3px rgba(249,115,22,0.08)' : '0 1px 2px rgba(0,0,0,0.04)',
                                        minWidth: '180px',
                                    }}
                                >
                                    <div className="flex items-center gap-2">
                                        <Icon icon="solar:calendar-minimalistic-linear" width={16} style={{ color: 'var(--orange-500)' }} />
                                        <span>{selectedMonth === 'all' ? 'ทุกเดือน' : new Date(selectedMonth + '-01').toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })}</span>
                                    </div>
                                    <Icon icon="solar:alt-arrow-down-linear" width={14} style={{ color: 'var(--gray-400)', transform: monthDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                                </button>
                                {monthDropdownOpen && (
                                    <div className="absolute right-0 mt-2 w-full min-w-[220px] rounded-xl overflow-hidden z-50" style={{ background: 'var(--white)', border: '1.5px solid var(--gray-200)', boxShadow: '0 8px 24px rgba(0,0,0,0.1)', animation: 'billingDropIn 0.15s ease-out' }}>
                                        <button
                                            onClick={() => { setSelectedMonth('all'); setMonthDropdownOpen(false); }}
                                            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-left transition-colors"
                                            style={{ background: selectedMonth === 'all' ? 'rgba(249,115,22,0.04)' : 'transparent', borderBottom: '1px solid var(--gray-100)' }}
                                            onMouseEnter={(e) => { if (selectedMonth !== 'all') e.currentTarget.style.background = 'var(--gray-50)'; }}
                                            onMouseLeave={(e) => { if (selectedMonth !== 'all') e.currentTarget.style.background = 'transparent'; }}
                                        >
                                            <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: selectedMonth === 'all' ? 'rgba(249,115,22,0.08)' : 'var(--gray-100)' }}>
                                                <Icon icon="solar:calendar-minimalistic-linear" width={14} style={{ color: selectedMonth === 'all' ? 'var(--orange-500)' : 'var(--gray-500)' }} />
                                            </div>
                                            <span className="flex-1 font-semibold" style={{ color: selectedMonth === 'all' ? 'var(--orange-600)' : 'var(--gray-900)' }}>ทุกเดือน</span>
                                            {selectedMonth === 'all' && <Icon icon="solar:check-circle-bold" width={16} style={{ color: 'var(--orange-500)' }} />}
                                        </button>
                                        <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                                            {availableMonths.map((m, idx) => {
                                                const isSelected = selectedMonth === m;
                                                return (
                                                    <button key={m} onClick={() => { setSelectedMonth(m); setMonthDropdownOpen(false); }}
                                                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors"
                                                        style={{ background: isSelected ? 'rgba(249,115,22,0.04)' : 'transparent', borderBottom: idx < availableMonths.length - 1 ? '1px solid var(--gray-50)' : 'none' }}
                                                        onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = 'var(--gray-50)'; }}
                                                        onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                                                    >
                                                        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: isSelected ? 'rgba(249,115,22,0.08)' : 'var(--gray-100)' }}>
                                                            <Icon icon="solar:calendar-date-bold" width={14} style={{ color: isSelected ? 'var(--orange-500)' : 'var(--gray-400)' }} />
                                                        </div>
                                                        <span className="flex-1 font-semibold" style={{ color: isSelected ? 'var(--orange-600)' : 'var(--gray-900)' }}>
                                                            {new Date(m + '-01').toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })}
                                                        </span>
                                                        {isSelected && <Icon icon="solar:check-circle-bold" width={16} style={{ color: 'var(--orange-500)' }} />}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Event Selector Dropdown */}
                        <div className="relative" ref={eventDropdownRef}>
                            <button
                                onClick={() => { setEventDropdownOpen(!eventDropdownOpen); setMonthDropdownOpen(false); }}
                                className="flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all whitespace-nowrap"
                                style={{
                                    background: 'var(--white)',
                                    border: `1.5px solid ${eventDropdownOpen ? 'var(--orange-500)' : 'var(--gray-200)'}`,
                                    color: 'var(--gray-900)',
                                    boxShadow: eventDropdownOpen ? '0 0 0 3px rgba(249,115,22,0.08)' : '0 1px 2px rgba(0,0,0,0.04)',
                                    minWidth: '260px',
                                }}
                            >
                                <div className="flex items-center gap-2">
                                    <Icon icon={selectedEventId === 'all' ? 'solar:chart-square-linear' : 'solar:calendar-date-bold'} width={16} style={{ color: 'var(--orange-500)' }} />
                                    <span className="truncate">
                                        {selectedEventId === 'all'
                                            ? 'แสดงทั้งหมด (สรุปยอดค้าง)'
                                            : (() => { const ev = events.find(e => e.id === selectedEventId); return ev ? new Date(ev.event_date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }) + (ev.status === 'open' ? ' (เปิด)' : ' (ปิด)') : 'เลือกก๊วน'; })()
                                        }
                                    </span>
                                </div>
                                <Icon icon="solar:alt-arrow-down-linear" width={14} style={{ color: 'var(--gray-400)', transform: eventDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                            </button>
                            {eventDropdownOpen && (
                                <div className="absolute right-0 mt-2 w-full min-w-[300px] rounded-xl overflow-hidden z-50" style={{ background: 'var(--white)', border: '1.5px solid var(--gray-200)', boxShadow: '0 8px 24px rgba(0,0,0,0.1)', animation: 'billingDropIn 0.15s ease-out' }}>
                                    {/* All option */}
                                    <button
                                        onClick={() => { setSelectedEventId('all'); setEventDropdownOpen(false); }}
                                        className="w-full flex items-center gap-3 px-4 py-3 text-sm text-left transition-colors"
                                        style={{ background: selectedEventId === 'all' ? 'rgba(249,115,22,0.04)' : 'transparent', borderBottom: '1px solid var(--gray-100)' }}
                                        onMouseEnter={(e) => { if (selectedEventId !== 'all') e.currentTarget.style.background = 'var(--gray-50)'; }}
                                        onMouseLeave={(e) => { if (selectedEventId !== 'all') e.currentTarget.style.background = 'transparent'; }}
                                    >
                                        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: selectedEventId === 'all' ? 'rgba(249,115,22,0.08)' : 'var(--gray-100)' }}>
                                            <Icon icon="solar:chart-square-linear" width={16} style={{ color: selectedEventId === 'all' ? 'var(--orange-500)' : 'var(--gray-500)' }} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-semibold" style={{ color: selectedEventId === 'all' ? 'var(--orange-600)' : 'var(--gray-900)' }}>แสดงทั้งหมด (สรุปยอดค้าง)</p>
                                            <p className="text-[11px]" style={{ color: 'var(--gray-500)' }}>รวมยอดค้างจากทุกก๊วน</p>
                                        </div>
                                        {selectedEventId === 'all' && <Icon icon="solar:check-circle-bold" width={18} style={{ color: 'var(--orange-500)' }} />}
                                    </button>

                                    {/* Section label */}
                                    <div className="px-4 py-2" style={{ background: 'var(--gray-50)' }}>
                                        <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--gray-400)' }}>เลือกก๊วน</p>
                                    </div>

                                    {/* Events */}
                                    <div style={{ maxHeight: '240px', overflowY: 'auto' }}>
                                        {events.map((ev, idx) => {
                                            const isSelected = selectedEventId === ev.id;
                                            const dateStr = new Date(ev.event_date).toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
                                            return (
                                                <button key={ev.id} onClick={() => { setSelectedEventId(ev.id); setEventDropdownOpen(false); }}
                                                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors"
                                                    style={{ background: isSelected ? 'rgba(249,115,22,0.04)' : 'transparent', borderBottom: idx < events.length - 1 ? '1px solid var(--gray-50)' : 'none' }}
                                                    onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = 'var(--gray-50)'; }}
                                                    onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                                                >
                                                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{
                                                        background: isSelected ? 'rgba(249,115,22,0.08)' : ev.status === 'open' ? 'rgba(22,163,74,0.06)' : 'var(--gray-100)',
                                                    }}>
                                                        <Icon icon="solar:calendar-date-bold" width={16} style={{
                                                            color: isSelected ? 'var(--orange-500)' : ev.status === 'open' ? 'var(--success)' : 'var(--gray-400)',
                                                        }} />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-semibold truncate" style={{ color: isSelected ? 'var(--orange-600)' : 'var(--gray-900)' }}>{dateStr}</span>
                                                            {ev.status === 'open' && <span className="flex h-1.5 w-1.5 rounded-full shrink-0" style={{ background: 'var(--success)' }} />}
                                                        </div>
                                                        <p className="text-[11px]" style={{ color: 'var(--gray-500)' }}>
                                                            {ev.shuttlecock_brand} · ฿{ev.shuttlecock_price}/ลูก
                                                        </p>
                                                    </div>
                                                    {isSelected && <Icon icon="solar:check-circle-bold" width={18} style={{ color: 'var(--orange-500)' }} />}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Revenue Summary */}
                <div className="col-span-1 lg:col-span-12 grid grid-cols-2 sm:grid-cols-4 gap-3 mb-2">
                    {[
                        { label: 'ยอดค้างชำระรวม', value: `฿${totalPending.toFixed(0)}`, icon: 'solar:wallet-linear', color: 'var(--danger)' },
                        { label: 'ชำระแล้วทั้งหมด', value: `฿${totalPaid.toFixed(0)}`, icon: 'solar:check-circle-linear', color: 'var(--success)' },
                        { label: 'จ่ายครบแล้ว', value: `${paidCount} คน`, icon: 'solar:user-check-rounded-linear', color: 'var(--success)' },
                        { label: 'ยังค้างชำระ', value: `${pendingCount} คน`, icon: 'solar:user-cross-rounded-linear', color: 'var(--warning)' },
                    ].map((item, i) => (
                        <div key={i} className="stat-card">
                            <div className="flex items-center gap-2 mb-2">
                                <Icon icon={item.icon} width={18} style={{ color: item.color }} />
                                <span className="text-xs font-medium" style={{ color: 'var(--gray-500)' }}>{item.label}</span>
                            </div>
                            <p className="text-xl font-bold" style={{ color: 'var(--gray-900)' }}>{item.value}</p>
                        </div>
                    ))}
                </div>

                {/* Event Info / All View Badge */}
                <div className="col-span-1 lg:col-span-12 flex flex-wrap items-center gap-3 mb-2">
                    {selectedEvent ? (
                        <>
                            <span className="badge badge-orange">
                                <Icon icon="solar:tag-horizontal-linear" width={14} />
                                {selectedEvent.shuttlecock_brand}
                            </span>
                            <span className="badge badge-muted">ค่าสนาม ฿{selectedEvent.entry_fee}</span>
                            <span className="badge badge-muted">ค่าลูก ฿{selectedEvent.shuttlecock_price}/ลูก</span>
                            <span className={`badge ${selectedEvent.status === 'open' ? 'badge-success' : 'badge-muted'}`}>
                                {selectedEvent.status === 'open' ? 'กำลังเปิด' : 'ปิดแล้ว'}
                            </span>
                        </>
                    ) : (
                        <span className="badge badge-orange">
                            <Icon icon="solar:globus-linear" width={14} />
                            แสดงยอดค้างชำระสะสมจากทุกก๊วน
                        </span>
                    )}
                </div>

                {/* Player Bills Table */}
                <div className="col-span-1 lg:col-span-12">
                    {bills.length === 0 ? (
                        <div className="card text-center" style={{ padding: '48px 24px' }}>
                            <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-4" style={{ background: 'var(--gray-100)' }}>
                                <Icon icon="solar:users-group-rounded-linear" width={24} style={{ color: 'var(--gray-500)' }} />
                            </div>
                            <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--gray-900)' }}>ยังไม่มีผู้เล่น</h2>
                            <p className="text-sm" style={{ color: 'var(--gray-500)' }}>ยังไม่มีข้อมูลการเงินในส่วนนี้</p>
                        </div>
                    ) : (
                        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                            {/* Table Header */}
                            <div className="hidden sm:grid grid-cols-12 gap-2 px-5 py-3 text-xs font-bold uppercase tracking-wider" style={{ background: 'var(--gray-50)', color: 'var(--gray-500)', borderBottom: '1px solid var(--gray-200)' }}>
                                <div className="col-span-4">ผู้เล่น</div>
                                <div className="col-span-2 text-center">เกมสะสม</div>
                                <div className="col-span-2 text-center">{selectedEventId === 'all' ? 'ยอดรวมทั้งหมด' : 'ยอดที่ต้องจ่าย'}</div>
                                <div className="col-span-1 text-center">{selectedEventId === 'all' ? 'ค้างจ่าย' : 'ยอดเงิน'}</div>
                                <div className="col-span-1 text-center">สถานะ</div>
                                <div className="col-span-2 text-center">จัดการ</div>
                            </div>

                            {/* Table Rows */}
                            {paginatedBills.map((bill, index) => {
                                // For pagination, we need to base the "show date header" logic on the paginated array
                                const showDateHeader = selectedEventId === 'all' && bill.eventDate && (index === 0 || bill.eventDate !== paginatedBills[index - 1].eventDate);
                                return (
                                    <React.Fragment key={bill.userId + (bill.eventPlayerId || index)}>
                                        {showDateHeader && (
                                            <div className="px-5 py-2 flex items-center gap-2" style={{ background: 'var(--orange-50)', borderBottom: '1px solid var(--orange-100)' }}>
                                                <Icon icon="solar:calendar-date-bold" width={16} className="text-orange-600" />
                                                <span className="text-xs font-bold text-orange-800">
                                                    {new Date(bill.eventDate!).toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                                                </span>
                                            </div>
                                        )}
                                        <div
                                            className="grid grid-cols-1 sm:grid-cols-12 gap-2 px-5 py-4 items-center"
                                            style={{
                                                borderBottom: index < bills.length - 1 ? '1px solid var(--gray-100)' : 'none',
                                                background: bill.paymentStatus === 'paid' ? 'rgba(22, 163, 74, 0.02)' : 'transparent',
                                            }}
                                        >
                                            {/* Player */}
                                            <div className="sm:col-span-4 flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0" style={{ background: 'var(--gray-900)', color: 'var(--white)' }}>
                                                    {bill.displayName.charAt(0).toUpperCase()}
                                                </div>
                                                <div className="min-w-0 text-left">
                                                    <p className="text-sm font-bold truncate" style={{ color: 'var(--gray-900)' }}>
                                                        {truncateName(bill.displayName, 16)}
                                                    </p>
                                                    <p className="text-[11px] sm:hidden" style={{ color: 'var(--gray-500)' }}>
                                                        {bill.gamesPlayed} เกม {bill.shuttlecockCount && bill.shuttlecockCount > 0 ? `(${bill.shuttlecockCount} ลูก)` : ''} · ค้าง ฿{bill.amount.toFixed(0)}
                                                    </p>
                                                </div>
                                            </div>

                                            {/* Games */}
                                            <div className="hidden sm:flex flex-col col-span-2 items-center justify-center">
                                                <span className="text-sm font-medium" style={{ color: 'var(--gray-700)' }}>{bill.gamesPlayed} เกม</span>
                                                {bill.shuttlecockCount && bill.shuttlecockCount > 0 ? (
                                                    <span className="text-[10px] font-bold" style={{ color: 'var(--gray-400)' }}>{bill.shuttlecockCount} ลูก (#{bill.shuttlecockNums})</span>
                                                ) : null}
                                            </div>

                                            {/* Grand Total (All view) / Amount (Daily view) */}
                                            <div className="hidden sm:flex col-span-2 justify-center">
                                                <span className="text-sm font-bold" style={{ color: 'var(--gray-900)' }}>
                                                    ฿{(selectedEventId === 'all' ? (bill.totalOwed || 0) : bill.amount).toFixed(0)}
                                                </span>
                                            </div>

                                            {/* Amount (All view: Current Pending) */}
                                            <div className="hidden sm:flex col-span-1 justify-center">
                                                <span className="text-sm font-bold" style={{ color: bill.amount > 0 ? 'var(--danger)' : 'var(--success)' }}>
                                                    ฿{bill.amount.toFixed(0)}
                                                </span>
                                            </div>

                                            {/* Status */}
                                            <div className="hidden sm:flex col-span-1 justify-center">
                                                <span className={`badge ${bill.paymentStatus === 'paid' ? 'badge-success' : 'badge-warning'}`}>
                                                    {bill.paymentStatus === 'paid' ? 'จ่ายครบแล้ว' : 'มียอดค้าง'}
                                                </span>
                                            </div>

                                            {/* Actions */}
                                            <div className="sm:col-span-2 flex items-center justify-end sm:justify-center gap-2 mt-2 sm:mt-0">
                                                {/* Mobile status badge */}
                                                <span className={`badge sm:hidden ${bill.paymentStatus === 'paid' ? 'badge-success' : 'badge-warning'}`}>
                                                    {bill.paymentStatus === 'paid' ? 'จ่ายครบแล้ว' : selectedEventId === 'all' ? 'มียอดค้าง' : 'ยังไม่จ่าย'}
                                                </span>
                                                <div className="flex items-center gap-2 ml-auto sm:ml-0">
                                                    <button
                                                        onClick={() => loadPlayerHistory(bill.userId, bill.displayName)}
                                                        className="btn btn-ghost btn-sm"
                                                        title="ดูประวัติ"
                                                    >
                                                        <Icon icon="solar:history-linear" width={16} />
                                                        <span className="hidden sm:inline">ประวัติ</span>
                                                    </button>
                                                    {selectedEventId !== 'all' ? (
                                                        <>
                                                            {bill.slipUrl && (
                                                                <button
                                                                    onClick={() => setViewingSlip(bill.slipUrl)}
                                                                    className="btn btn-ghost btn-sm"
                                                                    title="ดูสลิป"
                                                                >
                                                                    <Icon icon="solar:gallery-linear" width={16} />
                                                                    <span className="hidden sm:inline">สลิป</span>
                                                                </button>
                                                            )}
                                                            <button
                                                                onClick={() => togglePayment(bill)}
                                                                className={`btn btn-sm ${bill.paymentStatus === 'paid' ? 'btn-outline' : 'btn-primary'}`}
                                                            >
                                                                <Icon icon={bill.paymentStatus === 'paid' ? 'solar:undo-left-linear' : 'solar:check-circle-linear'} width={16} />
                                                                <span className="hidden sm:inline">{bill.paymentStatus === 'paid' ? 'ยกเลิก' : 'ชำระแล้ว'}</span>
                                                            </button>
                                                        </>
                                                    ) : (
                                                        bill.amount > 0 && (
                                                            <p className="text-[10px] font-bold uppercase tracking-tight opacity-40 text-center">เลือกก๊วนเพื่อบันทึก</p>
                                                        )
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </React.Fragment>
                                );
                            })}
                        </div>
                    )}

                    {/* Pagination Controls */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-between px-4 py-4 mt-4 bg-white rounded-xl shadow-sm border border-gray-100">
                            <span className="text-sm text-gray-500 font-medium">
                                หน้า {currentPage} จาก {totalPages}
                            </span>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    disabled={currentPage === 1}
                                    className="btn btn-outline btn-sm px-3"
                                    style={currentPage === 1 ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
                                >
                                    <Icon icon="solar:alt-arrow-left-linear" width={16} />
                                    ย้อนกลับ
                                </button>
                                <button
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                    disabled={currentPage === totalPages}
                                    className="btn btn-outline btn-sm px-3"
                                    style={currentPage === totalPages ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
                                >
                                    ถัดไป
                                    <Icon icon="solar:alt-arrow-right-linear" width={16} />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* History Modal - Outside animation div for true full-screen blur */}
            {historyUser && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-in duration-200" onClick={() => setHistoryUser(null)}>
                    <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-md" />
                    <div className="relative max-w-2xl w-full card shadow-2xl overflow-hidden" style={{ padding: 0 }} onClick={(e) => e.stopPropagation()}>
                        <div className="p-6 border-b flex items-center justify-between" style={{ background: 'var(--gray-50)', borderColor: 'var(--gray-200)' }}>
                            <div className="flex items-center gap-3">
                                <Icon icon="solar:history-bold-duotone" width={24} style={{ color: 'var(--orange-500)' }} />
                                <div>
                                    <h3 className="text-lg font-bold" style={{ color: 'var(--gray-900)' }}>ประวัติการชำระเงิน</h3>
                                    <p className="text-sm font-medium" style={{ color: 'var(--gray-500)' }}>{truncateName(historyUser.name, 20)}</p>
                                </div>
                            </div>
                            <button onClick={() => setHistoryUser(null)} className="w-8 h-8 rounded-full flex items-center justify-center bg-white border hover:bg-gray-100 transition-colors">
                                <Icon icon="solar:close-circle-linear" width={20} style={{ color: 'var(--gray-500)' }} />
                            </button>
                        </div>

                        <div className="p-0 max-h-[60vh] overflow-y-auto">
                            {loadingHistory ? (
                                <div className="flex flex-col items-center justify-center py-20 gap-3">
                                    <div className="spinner" style={{ width: 32, height: 32 }} />
                                    <p className="text-sm font-medium" style={{ color: 'var(--gray-500)' }}>กำลังโหลดประวัติ...</p>
                                </div>
                            ) : historyData.length === 0 ? (
                                <div className="py-20 text-center">
                                    <Icon icon="solar:box-minimalistic-linear" width={48} className="mx-auto mb-3 opacity-20" />
                                    <p className="text-sm" style={{ color: 'var(--gray-500)' }}>ไม่พบข้อมูลประวัติ</p>
                                </div>
                            ) : (
                                <div className="divide-y" style={{ borderColor: 'var(--gray-100)' }}>
                                    {historyData.map((item, idx) => (
                                        <div key={idx} className="p-4 hover:bg-gray-50 transition-colors flex items-center justify-between gap-4">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-xl flex flex-col items-center justify-center text-[10px] font-bold uppercase tracking-tight" style={{ background: 'var(--gray-100)', color: 'var(--gray-600)' }}>
                                                    <span>{new Date(item.eventDate).toLocaleDateString('th-TH', { day: 'numeric' })}</span>
                                                    <span>{new Date(item.eventDate).toLocaleDateString('th-TH', { month: 'short' })}</span>
                                                </div>
                                                <div>
                                                    <p className="text-sm font-bold" style={{ color: 'var(--gray-900)' }}>
                                                        ฿{item.amount.toFixed(0)}
                                                    </p>
                                                    <p className="text-[11px]" style={{ color: 'var(--gray-500)' }}>
                                                        {item.games} เกม {item.shuttlecockCount > 0 && `· ลูกที่ใช้: ${item.shuttlecockCount} ลูก (${item.shuttlecockNums})`}
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-3">
                                                <span className={`badge ${item.status === 'paid' ? 'badge-success' : 'badge-warning'}`}>
                                                    {item.status === 'paid' ? 'จ่ายแล้ว' : 'ค้างชำระ'}
                                                </span>
                                                {item.slipUrl && (
                                                    <button
                                                        onClick={() => setViewingSlip(item.slipUrl)}
                                                        className="w-8 h-8 rounded-lg flex items-center justify-center border bg-white hover:bg-gray-50 transition-colors shadow-sm"
                                                        title="ดูสลิป"
                                                    >
                                                        <Icon icon="solar:gallery-linear" width={16} style={{ color: 'var(--gray-600)' }} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="p-4 bg-gray-50 border-t text-center" style={{ borderColor: 'var(--gray-200)' }}>
                            <p className="text-[11px] font-bold uppercase tracking-wider opacity-40">ประวัติย้อนหลังทั้งหมด</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Slip Viewer Modal */}
            {viewingSlip && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 animate-in duration-200" onClick={() => setViewingSlip(null)}>
                    <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-md" />
                    <div className="relative max-w-lg w-full card shadow-2xl overflow-hidden" style={{ padding: '24px' }} onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-base font-bold" style={{ color: 'var(--gray-900)' }}>สลิปโอนเงิน</h3>
                            <button onClick={() => setViewingSlip(null)} className="w-8 h-8 rounded-full flex items-center justify-center bg-gray-100 hover:bg-gray-200 transition-colors">
                                <Icon icon="solar:close-circle-linear" width={20} style={{ color: 'var(--gray-500)' }} />
                            </button>
                        </div>
                        <img src={viewingSlip} alt="Payment Slip" className="w-full rounded-xl" style={{ maxHeight: '70vh', objectFit: 'contain' }} />
                    </div>
                </div>
            )}
        </>
    );
}
