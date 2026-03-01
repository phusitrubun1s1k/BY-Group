'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/src/lib/supabase/client';
import type { Event } from '@/src/types';
import { Icon } from '@iconify/react';

interface PaymentPlayer {
    userId: string;
    displayName: string;
    paymentStatus: 'pending' | 'paid';
    eventDate?: string;
}

export default function DashboardPaymentStatus() {
    const [events, setEvents] = useState<Event[]>([]);
    const [selectedEventId, setSelectedEventId] = useState<string>('latest');
    const [players, setPlayers] = useState<PaymentPlayer[]>([]);
    const [loading, setLoading] = useState(true);
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close dropdown on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        loadEvents();
    }, []);

    const loadEvents = async () => {
        const supabase = createClient();
        const { data } = await supabase.from('events').select('*').order('event_date', { ascending: false });
        if (data && data.length > 0) {
            setEvents(data as Event[]);
            setSelectedEventId((data[0] as Event).id);
        }
        setLoading(false);
    };

    const loadPlayers = useCallback(async () => {
        if (!selectedEventId) return;
        setLoading(true);
        const supabase = createClient();

        try {
            if (selectedEventId === 'all') {
                const { data: allEP } = await supabase
                    .from('event_players')
                    .select('*, profiles(display_name)');

                if (!allEP) { setLoading(false); return; }

                const userMap: Record<string, PaymentPlayer> = {};
                for (const ep of allEP as any[]) {
                    const uid = ep.user_id;
                    if (!userMap[uid]) {
                        userMap[uid] = {
                            userId: uid,
                            displayName: ep.profiles?.display_name || 'ไม่ทราบชื่อ',
                            paymentStatus: 'paid',
                        };
                    }
                    if (ep.payment_status === 'pending') {
                        userMap[uid].paymentStatus = 'pending';
                    }
                }

                const result = Object.values(userMap);
                result.sort((a, b) => {
                    if (a.paymentStatus !== b.paymentStatus) return a.paymentStatus === 'pending' ? -1 : 1;
                    return a.displayName.localeCompare(b.displayName);
                });
                setPlayers(result);
            } else {
                const { data: eventPlayers } = await supabase
                    .from('event_players')
                    .select('*, profiles(display_name)')
                    .eq('event_id', selectedEventId);

                if (!eventPlayers) { setLoading(false); return; }

                const result: PaymentPlayer[] = (eventPlayers as any[]).map(ep => ({
                    userId: ep.user_id,
                    displayName: ep.profiles?.display_name || 'ไม่ทราบชื่อ',
                    paymentStatus: ep.payment_status,
                }));

                result.sort((a, b) => {
                    if (a.paymentStatus !== b.paymentStatus) return a.paymentStatus === 'pending' ? -1 : 1;
                    return a.displayName.localeCompare(b.displayName);
                });
                setPlayers(result);
            }
        } catch {
            setPlayers([]);
        } finally {
            setLoading(false);
        }
    }, [selectedEventId]);

    useEffect(() => {
        if (selectedEventId) loadPlayers();
    }, [selectedEventId, loadPlayers]);

    const paidCount = players.filter(p => p.paymentStatus === 'paid').length;
    const pendingCount = players.filter(p => p.paymentStatus === 'pending').length;

    // Get label for selected event
    const getSelectedLabel = () => {
        if (selectedEventId === 'all') return 'ทุกก๊วน (สรุปรวม)';
        const ev = events.find(e => e.id === selectedEventId);
        if (!ev) return 'เลือกก๊วน';
        return new Date(ev.event_date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
            + (ev.status === 'open' ? ' (เปิด)' : '');
    };

    const getSelectedIcon = () => {
        return selectedEventId === 'all' ? 'solar:chart-square-linear' : 'solar:calendar-date-bold';
    };

    return (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {/* Header */}
            <div className="px-5 py-4 flex items-center justify-between gap-3" style={{ borderBottom: '1px solid var(--gray-200)' }}>
                <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(249,115,22,0.06)' }}>
                        <Icon icon="solar:wallet-money-linear" width={20} style={{ color: 'var(--orange-500)' }} />
                    </div>
                    <div className="min-w-0">
                        <p className="text-sm font-bold" style={{ color: 'var(--gray-900)' }}>สถานะการจ่ายเงิน</p>
                        <p className="text-[11px]" style={{ color: 'var(--gray-500)' }}>
                            {players.length > 0 ? `จ่ายแล้ว ${paidCount}/${players.length} คน` : 'ไม่มีข้อมูล'}
                        </p>
                    </div>
                </div>
                {pendingCount > 0 && (
                    <span className="badge badge-warning shrink-0">ค้าง {pendingCount}</span>
                )}
            </div>

            {/* Custom Dropdown Filter */}
            <div className="px-4 py-3 relative" ref={dropdownRef} style={{ background: 'var(--gray-50)', borderBottom: '1px solid var(--gray-100)' }}>
                <button
                    onClick={() => setDropdownOpen(!dropdownOpen)}
                    className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all"
                    style={{
                        background: 'var(--white)',
                        border: `1.5px solid ${dropdownOpen ? 'var(--orange-500)' : 'var(--gray-200)'}`,
                        color: 'var(--gray-900)',
                        boxShadow: dropdownOpen ? '0 0 0 3px rgba(249,115,22,0.08)' : '0 1px 2px rgba(0,0,0,0.04)',
                    }}
                >
                    <div className="flex items-center gap-2.5 min-w-0">
                        <Icon icon={getSelectedIcon()} width={18} style={{ color: 'var(--orange-500)' }} />
                        <span className="truncate">{getSelectedLabel()}</span>
                    </div>
                    <Icon
                        icon="solar:alt-arrow-down-linear"
                        width={16}
                        style={{
                            color: 'var(--gray-400)',
                            transform: dropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                            transition: 'transform 0.2s ease',
                        }}
                    />
                </button>

                {/* Dropdown Menu */}
                {dropdownOpen && (
                    <div
                        className="absolute left-4 right-4 mt-2 rounded-xl overflow-hidden z-50"
                        style={{
                            background: 'var(--white)',
                            border: '1.5px solid var(--gray-200)',
                            boxShadow: '0 8px 24px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04)',
                            animation: 'fadeInDropdown 0.15s ease-out',
                        }}
                    >
                        <style>{`
                            @keyframes fadeInDropdown {
                                from { opacity: 0; transform: translateY(-4px); }
                                to { opacity: 1; transform: translateY(0); }
                            }
                        `}</style>

                        {/* "All" option */}
                        <button
                            onClick={() => { setSelectedEventId('all'); setDropdownOpen(false); }}
                            className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm transition-colors"
                            style={{
                                background: selectedEventId === 'all' ? 'rgba(249,115,22,0.04)' : 'transparent',
                                borderBottom: '1px solid var(--gray-100)',
                            }}
                            onMouseEnter={(e) => { if (selectedEventId !== 'all') e.currentTarget.style.background = 'var(--gray-50)'; }}
                            onMouseLeave={(e) => { if (selectedEventId !== 'all') e.currentTarget.style.background = 'transparent'; }}
                        >
                            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{
                                background: selectedEventId === 'all' ? 'rgba(249,115,22,0.08)' : 'var(--gray-100)',
                            }}>
                                <Icon icon="solar:chart-square-linear" width={16} style={{
                                    color: selectedEventId === 'all' ? 'var(--orange-500)' : 'var(--gray-500)',
                                }} />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="font-semibold" style={{ color: selectedEventId === 'all' ? 'var(--orange-600)' : 'var(--gray-900)' }}>
                                    ทุกก๊วน (สรุปรวม)
                                </p>
                                <p className="text-[11px]" style={{ color: 'var(--gray-500)' }}>รวมสถานะจากทุกก๊วน</p>
                            </div>
                            {selectedEventId === 'all' && (
                                <Icon icon="solar:check-circle-bold" width={18} style={{ color: 'var(--orange-500)' }} />
                            )}
                        </button>

                        {/* Event label */}
                        <div className="px-4 py-2" style={{ background: 'var(--gray-50)' }}>
                            <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--gray-400)' }}>เลือกก๊วน</p>
                        </div>

                        {/* Event options */}
                        <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                            {events.map((ev, idx) => {
                                const isSelected = selectedEventId === ev.id;
                                const dateStr = new Date(ev.event_date).toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
                                return (
                                    <button
                                        key={ev.id}
                                        onClick={() => { setSelectedEventId(ev.id); setDropdownOpen(false); }}
                                        className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors"
                                        style={{
                                            background: isSelected ? 'rgba(249,115,22,0.04)' : 'transparent',
                                            borderBottom: idx < events.length - 1 ? '1px solid var(--gray-50)' : 'none',
                                        }}
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
                                                <p className="font-semibold truncate" style={{ color: isSelected ? 'var(--orange-600)' : 'var(--gray-900)' }}>
                                                    {dateStr}
                                                </p>
                                                {ev.status === 'open' && (
                                                    <span className="flex h-1.5 w-1.5 rounded-full shrink-0" style={{ background: 'var(--success)' }} />
                                                )}
                                            </div>
                                        </div>
                                        {isSelected && (
                                            <Icon icon="solar:check-circle-bold" width={18} style={{ color: 'var(--orange-500)' }} />
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            {/* Player List */}
            {loading ? (
                <div className="flex items-center justify-center py-10">
                    <div className="spinner" style={{ width: 24, height: 24 }} />
                </div>
            ) : players.length === 0 ? (
                <div className="py-10 text-center">
                    <Icon icon="solar:users-group-rounded-linear" width={32} className="mx-auto mb-2 opacity-20" />
                    <p className="text-xs" style={{ color: 'var(--gray-500)' }}>ไม่มีผู้เล่นในก๊วนนี้</p>
                </div>
            ) : (
                <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
                    {players.map((player, idx) => {
                        const isPaid = player.paymentStatus === 'paid';
                        return (
                            <div
                                key={player.userId}
                                className="flex items-center justify-between px-5 py-2.5"
                                style={{
                                    borderBottom: idx < players.length - 1 ? '1px solid var(--gray-100)' : 'none',
                                    background: isPaid ? 'rgba(22,163,74,0.02)' : 'transparent',
                                }}
                            >
                                <div className="flex items-center gap-2.5 min-w-0">
                                    <div
                                        className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                                        style={{ background: 'var(--gray-900)', color: 'var(--white)' }}
                                    >
                                        {player.displayName.charAt(0).toUpperCase()}
                                    </div>
                                    <p className="text-sm font-medium truncate" style={{ color: 'var(--gray-900)' }}>
                                        {player.displayName}
                                    </p>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                                    {isPaid ? (
                                        <span className="flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(22,163,74,0.08)', color: 'var(--success)' }}>
                                            <Icon icon="solar:check-circle-bold" width={13} />
                                            จ่ายแล้ว
                                        </span>
                                    ) : (
                                        <span className="flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(234,88,12,0.08)', color: 'var(--warning)' }}>
                                            <Icon icon="solar:clock-circle-linear" width={13} />
                                            ยังไม่จ่าย
                                        </span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
