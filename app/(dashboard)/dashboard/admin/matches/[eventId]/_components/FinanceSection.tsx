'use client';

import type { Dispatch, SetStateAction } from 'react';
import type { Event, EventPlayer, Match, Profile } from '@/src/types';
import { Icon } from '@iconify/react';
import { truncateName } from '@/src/lib/string-utils';
import { billedShuttleCount } from '@/src/lib/utils/billing';

export interface FinanceSectionProps {
    activeSection: "matches" | "finance";
    players: EventPlayer[];
    totalBilled: number;
    totalCollected: number;
    totalOutstanding: number;
    paidPlayerCount: number;
    transferTotal: number;
    transferPlayerCount: number;
    cashTotal: number;
    cashPlayerCount: number;
    totalDiscount: number;
    discountedPlayerCount: number;
    totalAdditionalCost: number;
    additionalCostPlayerCount: number;
    pendingPlayerCount: number;
    setPaymentFilter: Dispatch<SetStateAction<"pending" | "paid" | "all">>;
    paymentFilter: "pending" | "paid" | "all";
    visiblePaymentPlayers: EventPlayer[];
    setPaymentSortOrder: Dispatch<SetStateAction<"pending_first" | "paid_first">>;
    paymentSortOrder: "pending_first" | "paid_first";
    paymentSearchQuery: string;
    setPaymentSearchQuery: Dispatch<SetStateAction<string>>;
    updatingPayment: string | null;
    paymentTimestamps: Record<string, string>;
    formatPaymentTime: (isoString?: string | null) => string;
    event: Event | null;
    matches: Match[];
    updateAdditionalCost: (ep: EventPlayer, additionalCostValue: number) => Promise<boolean>;
    updateDiscount: (ep: EventPlayer, discountValue: number) => Promise<boolean>;
    userBills: Record<string, number>;
    togglePayment: (ep: EventPlayer) => Promise<void>;
}

export default function FinanceSection({ activeSection, players, totalBilled, totalCollected, totalOutstanding, paidPlayerCount, transferTotal, transferPlayerCount, cashTotal, cashPlayerCount, totalDiscount, discountedPlayerCount, totalAdditionalCost, additionalCostPlayerCount, pendingPlayerCount, setPaymentFilter, paymentFilter, visiblePaymentPlayers, setPaymentSortOrder, paymentSortOrder, paymentSearchQuery, setPaymentSearchQuery, updatingPayment, paymentTimestamps, formatPaymentTime, event, matches, updateAdditionalCost, updateDiscount, userBills, togglePayment }: FinanceSectionProps) {
    return (
        <>
            {activeSection === 'finance' && players.length > 0 && (
                            <div className="space-y-4 animate-in">
                                {/* Core Billing Summary */}
                                <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                                    {[
                                        { label: 'ยอดทั้งหมด', value: totalBilled, icon: 'solar:bill-list-bold-duotone', color: 'text-blue-600', bg: 'bg-blue-50' },
                                        { label: 'เก็บแล้ว', value: totalCollected, icon: 'solar:wallet-money-bold-duotone', color: 'text-green-600', bg: 'bg-green-50' },
                                        { label: 'ยอดค้าง', value: totalOutstanding, icon: 'solar:clock-circle-bold-duotone', color: 'text-orange-600', bg: 'bg-orange-50' },
                                        { label: 'ชำระแล้ว', value: paidPlayerCount, suffix: `/${players.length} คน`, icon: 'solar:verified-check-bold-duotone', color: 'text-emerald-600', bg: 'bg-emerald-50' },
                                    ].map(summary => (
                                        <div key={summary.label} className="card flex items-center gap-3" style={{ padding: '16px 18px' }}>
                                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${summary.bg} ${summary.color}`}>
                                                <Icon icon={summary.icon} width={21} />
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-[11px] font-semibold text-gray-500">{summary.label}</p>
                                                <p className="text-lg font-black text-gray-900 truncate">{summary.suffix ? summary.value.toLocaleString() : `฿${summary.value.toLocaleString()}`} {summary.suffix && <span className="text-xs font-semibold text-gray-500">{summary.suffix}</span>}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* Mini Dashboard: สรุปช่องทางชำระเงินและส่วนลด */}
                                <div className="card p-4 bg-gradient-to-br from-white to-gray-50/70 border border-gray-200 shadow-sm">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3.5 pb-2.5 border-b border-gray-100">
                                        <div className="flex items-center gap-2">
                                            <div className="w-7 h-7 rounded-lg bg-orange-100 text-orange-600 flex items-center justify-center">
                                                <Icon icon="solar:chart-square-bold-duotone" width={18} />
                                            </div>
                                            <div>
                                                <h3 className="text-xs font-black text-gray-900 uppercase tracking-wider">มินิแดชบอร์ดสรุปยอดชำระ</h3>
                                                <p className="text-[11px] text-gray-500">ยอดจริงหลังคำนวณค่าเพิ่มและส่วนลดของผู้เล่นทุกคน</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[11px] font-bold text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">
                                                {players.length} ผู้เล่นทั้งหมด
                                            </span>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                                        {/* 1. ยอดโอน ทั้งหมด */}
                                        <div className="rounded-xl p-3.5 bg-blue-50/60 border border-blue-100 hover:border-blue-200 transition-all flex flex-col justify-between">
                                            <div className="flex items-center justify-between gap-2 mb-2">
                                                <span className="text-[11px] font-bold text-blue-700">ยอดโอน ทั้งหมด</span>
                                                <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                                                    <Icon icon="solar:smartphone-line-duotone" width={16} />
                                                </div>
                                            </div>
                                            <div>
                                                <p className="text-xl font-black text-blue-900 tabular-nums">
                                                    ฿{transferTotal.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                                                </p>
                                                <p className="text-[10px] font-semibold text-blue-600/80 mt-1">
                                                    {transferPlayerCount > 0 ? `${transferPlayerCount} คน โอนเงินแล้ว` : 'ยังไม่มีเงินโอน'}
                                                </p>
                                            </div>
                                        </div>

                                        {/* 2. เงินสด ทั้งหมด */}
                                        <div className="rounded-xl p-3.5 bg-emerald-50/60 border border-emerald-100 hover:border-emerald-200 transition-all flex flex-col justify-between">
                                            <div className="flex items-center justify-between gap-2 mb-2">
                                                <span className="text-[11px] font-bold text-emerald-700">เงินสด ทั้งหมด</span>
                                                <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                                                    <Icon icon="solar:notes-line-duotone" width={16} />
                                                </div>
                                            </div>
                                            <div>
                                                <p className="text-xl font-black text-emerald-900 tabular-nums">
                                                    ฿{cashTotal.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                                                </p>
                                                <p className="text-[10px] font-semibold text-emerald-600/80 mt-1">
                                                    {cashPlayerCount > 0 ? `${cashPlayerCount} คน จ่ายสดแล้ว` : 'ยังไม่มีเงินสด'}
                                                </p>
                                            </div>
                                        </div>

                                        {/* 3. ลด ทั้งหมด */}
                                        <div className="rounded-xl p-3.5 bg-purple-50/60 border border-purple-100 hover:border-purple-200 transition-all flex flex-col justify-between">
                                            <div className="flex items-center justify-between gap-2 mb-2">
                                                <span className="text-[11px] font-bold text-purple-700">ลด ทั้งหมด</span>
                                                <div className="w-7 h-7 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center shrink-0">
                                                    <Icon icon="solar:tag-price-bold-duotone" width={16} />
                                                </div>
                                            </div>
                                            <div>
                                                <p className="text-xl font-black text-purple-900 tabular-nums">
                                                    ฿{totalDiscount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                                                </p>
                                                <p className="text-[10px] font-semibold text-purple-600/80 mt-1">
                                                    {discountedPlayerCount > 0 ? `${discountedPlayerCount} คน ได้รับส่วนลด` : 'ไม่มีผู้เล่นได้ลด'}
                                                </p>
                                            </div>
                                        </div>

                                        {/* 4. ค่าเพิ่ม ทั้งหมด */}
                                        <div className="rounded-xl p-3.5 bg-amber-50/60 border border-amber-100 hover:border-amber-200 transition-all flex flex-col justify-between">
                                            <div className="flex items-center justify-between gap-2 mb-2">
                                                <span className="text-[11px] font-bold text-amber-700">ค่าเพิ่ม ทั้งหมด</span>
                                                <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                                                    <Icon icon="solar:add-circle-bold-duotone" width={16} />
                                                </div>
                                            </div>
                                            <div>
                                                <p className="text-xl font-black text-amber-900 tabular-nums">
                                                    ฿{totalAdditionalCost.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                                                </p>
                                                <p className="text-[10px] font-semibold text-amber-600/80 mt-1">
                                                    {additionalCostPlayerCount > 0 ? `${additionalCostPlayerCount} คน มีค่าใช้จ่ายเพิ่ม` : 'ไม่มีค่าเพิ่ม'}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="card shadow-sm" style={{ padding: 0, overflow: 'hidden' }}>
                                <div
                                    className="w-full flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4"
                                    style={{ borderBottom: '1px solid var(--gray-200)' }}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(22,163,74,0.06)' }}>
                                            <Icon icon="solar:wallet-money-linear" width={20} style={{ color: 'var(--success)' }} />
                                        </div>
                                        <div className="text-left">
                                            <p className="text-sm font-bold" style={{ color: 'var(--gray-900)' }}>สถานะการจ่ายเงิน</p>
                                            <p className="text-xs mt-0.5" style={{ color: 'var(--gray-500)' }}>ค้นหา แก้ยอด และรับชำระเงินของผู้เล่นแต่ละคน</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {players.filter(p => p.payment_status === 'pending').length > 0 && (
                                            <span className="badge badge-warning">
                                                ค้าง {players.filter(p => p.payment_status === 'pending').length}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                    <div className="flex flex-col">
                                        {/* Payment Search Box */}
                                        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/50 flex flex-col lg:flex-row gap-3">
                                            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-white border border-gray-200 overflow-x-auto shrink-0">
                                                {([
                                                    { id: 'all', label: 'ทั้งหมด', count: players.length },
                                                    { id: 'pending', label: 'ยังไม่จ่าย', count: pendingPlayerCount },
                                                    { id: 'paid', label: 'จ่ายแล้ว', count: paidPlayerCount },
                                                ] as const).map(filter => (
                                                    <button
                                                        key={filter.id}
                                                        type="button"
                                                        onClick={() => setPaymentFilter(filter.id)}
                                                        className={`min-h-9 px-3 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${paymentFilter === filter.id ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-500 hover:bg-orange-50 hover:text-orange-600'}`}
                                                    >
                                                        {filter.label}
                                                        <span className={`px-1.5 py-0.5 rounded text-[9px] ${paymentFilter === filter.id ? 'bg-white/20' : 'bg-gray-100 text-gray-500'}`}>{filter.count}</span>
                                                    </button>
                                                ))}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between gap-3 mb-1.5">
                                                    <label htmlFor="payment-player-search" className="text-[11px] font-bold text-gray-600">ค้นหาผู้เล่น</label>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[10px] font-semibold text-gray-400">พบ {visiblePaymentPlayers.length} คน</span>
                                                        {paymentFilter === 'all' && (
                                                            <button
                                                                type="button"
                                                                onClick={() => setPaymentSortOrder(prev => prev === 'pending_first' ? 'paid_first' : 'pending_first')}
                                                                className="text-[10px] font-bold px-2 py-0.5 rounded-md border border-gray-200 bg-white hover:bg-orange-50 hover:text-orange-600 hover:border-orange-200 text-gray-600 flex items-center gap-1 transition-all"
                                                                title={paymentSortOrder === 'pending_first' ? 'คลิกเพื่อสลับ: ให้คนที่จ่ายแล้วอยู่บน' : 'คลิกเพื่อสลับ: ให้คนที่ยังไม่จ่ายอยู่บน'}
                                                            >
                                                                <Icon icon="solar:sort-vertical-linear" width={12} className="text-orange-500" />
                                                                {paymentSortOrder === 'pending_first' ? 'ยังไม่จ่ายอยู่บน' : 'จ่ายแล้วอยู่บน'}
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="relative">
                                                    <Icon icon="solar:magnifer-linear" width={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                                                    <input
                                                        id="payment-player-search"
                                                        type="search"
                                                        autoComplete="off"
                                                        aria-label="ค้นหาผู้เล่นจากชื่อหรือระดับมือ"
                                                        placeholder="พิมพ์ชื่อ ชื่อจริง หรือระดับมือ..."
                                                        value={paymentSearchQuery}
                                                        onChange={(e) => setPaymentSearchQuery(e.target.value)}
                                                        onKeyDown={(e) => { if (e.key === 'Escape') setPaymentSearchQuery(''); }}
                                                        className="w-full min-h-11 pl-10 pr-10 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400 transition-all"
                                                    />
                                                    {paymentSearchQuery && (
                                                        <button
                                                            type="button"
                                                            aria-label="ล้างคำค้นหา"
                                                            onClick={() => setPaymentSearchQuery('')}
                                                            className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-orange-600 hover:bg-orange-50"
                                                        >
                                                            <Icon icon="solar:close-circle-bold" width={18} />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Sort: pending first, then paid */}
                                        {visiblePaymentPlayers
                                            .map((ep, index) => {
                                                const prof = ep.profiles as unknown as Profile;
                                                const isPaid = ep.payment_status === 'paid';
                                                const isUpdating = updatingPayment === ep.user_id;
                                                const paidTimestamp = paymentTimestamps[ep.id] || (ep as any).paid_at;
                                                const paidTimeText = isPaid ? formatPaymentTime(paidTimestamp) : '';
                                                const originalBill = (() => {
                                                    if (!event) return 0;
                                                    let totalShuttleCost = 0;
                                                    matches.filter(m =>
                                                        (m.status === 'finished' || m.status === 'playing') &&
                                                        m.match_players?.some(mp => mp.user_id === ep.user_id)
                                                    ).forEach(m => {
                                                        // เกมที่เล่นแล้วนับอย่างน้อย 1 ลูก (เบิกเพิ่มนับตามจริง)
                                                        totalShuttleCost += billedShuttleCount(m.shuttlecock_numbers) * (event.shuttlecock_price || 0);
                                                    });
                                                    return (event.entry_fee || 0) + totalShuttleCost + (ep.additional_cost || 0);
                                                })();
                                                const hasDiscount = (ep.discount || 0) > 0;
                                                const hasUnfinishedMatches = !isPaid && matches.some(m =>
                                                    (m.status === 'playing' || m.status === 'waiting') &&
                                                    m.match_players?.some(mp => mp.user_id === ep.user_id)
                                                );
                                                return (
                                                    <div
                                                        key={ep.id}
                                                        className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 px-5 py-3 transition-colors"
                                                        style={{
                                                            borderBottom: index < visiblePaymentPlayers.length - 1 ? '1px solid var(--gray-100)' : 'none',
                                                            background: isPaid ? 'rgba(22, 163, 74, 0.02)' : hasUnfinishedMatches ? 'rgba(245, 158, 11, 0.02)' : 'transparent',
                                                        }}
                                                    >
                                                        <div className="flex items-center gap-3 min-w-0">
                                                            <div
                                                                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                                                                style={{ background: 'var(--gray-900)', color: 'var(--white)' }}
                                                            >
                                                                {prof?.display_name?.charAt(0)?.toUpperCase()}
                                                            </div>
                                                            <div className="min-w-0">
                                                                <p className="text-sm font-medium truncate" style={{ color: 'var(--gray-900)' }}>
                                                                    {truncateName(prof?.display_name, 20)}
                                                                </p>
                                                                {isPaid && paidTimeText && (
                                                                    <p className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1 mt-0.5" title={`เวลายืนยันชำระเงิน: ${paidTimestamp ? new Date(paidTimestamp).toLocaleString('th-TH') : 'ไม่ระบุ'}`}>
                                                                        <Icon icon="solar:clock-circle-bold" width={12} className="text-emerald-500 shrink-0" />
                                                                        จ่ายเมื่อ {paidTimeText}
                                                                    </p>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto lg:shrink-0 lg:ml-2">
                                                            {/* Additional Cost Input */}
                                                            <label className="flex flex-col gap-1 text-[10px] font-semibold text-gray-500">
                                                                ค่าเพิ่ม
                                                                <input
                                                                    type="number"
                                                                    min={0}
                                                                    step="0.01"
                                                                    disabled={isUpdating}
                                                                    placeholder="0"
                                                                    defaultValue={ep.additional_cost || ''}
                                                                    onBlur={async (e) => {
                                                                        const input = e.currentTarget;
                                                                        const parsed = Number(e.target.value);
                                                                        const val = Number.isFinite(parsed) ? Math.max(0, Math.round(parsed * 100) / 100) : 0;
                                                                        if (val !== (ep.additional_cost || 0)) {
                                                                            const saved = await updateAdditionalCost(ep, val);
                                                                            if (!saved) input.value = ep.additional_cost ? String(ep.additional_cost) : '';
                                                                        }
                                                                    }}
                                                                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                                                    className="w-16 text-right text-xs font-semibold px-2 py-1 rounded-lg border border-gray-200 focus:border-red-400 focus:ring-1 focus:ring-red-200 focus:outline-none transition-all"
                                                                    style={{ background: (ep.additional_cost || 0) > 0 ? 'rgba(239,68,68,0.04)' : 'white', color: (ep.additional_cost || 0) > 0 ? '#ef4444' : 'var(--gray-600)' }}
                                                                    title="ค่าใช้จ่ายเพิ่มเติม (บาท)"
                                                                />
                                                            </label>

                                                            {/* Discount Input */}
                                                            <label className="flex flex-col gap-1 text-[10px] font-semibold text-gray-500">
                                                                ส่วนลด
                                                                <input
                                                                    type="number"
                                                                    min={0}
                                                                    step="0.01"
                                                                    disabled={isUpdating}
                                                                    placeholder="0"
                                                                    defaultValue={ep.discount || ''}
                                                                    onBlur={async (e) => {
                                                                        const input = e.currentTarget;
                                                                        const parsed = Number(e.target.value);
                                                                        const val = Number.isFinite(parsed) ? Math.max(0, Math.round(parsed * 100) / 100) : 0;
                                                                        if (val !== (ep.discount || 0)) {
                                                                            const saved = await updateDiscount(ep, val);
                                                                            if (!saved) input.value = ep.discount ? String(ep.discount) : '';
                                                                        }
                                                                    }}
                                                                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                                                    className="w-16 text-right text-xs font-semibold px-2 py-1 rounded-lg border border-gray-200 focus:border-purple-400 focus:ring-1 focus:ring-purple-200 focus:outline-none transition-all"
                                                                    style={{ background: hasDiscount ? 'rgba(147,51,234,0.04)' : 'white', color: hasDiscount ? '#7c3aed' : 'var(--gray-600)' }}
                                                                    title="ส่วนลด (บาท)"
                                                                />
                                                            </label>

                                                            {/* Bill Amount */}
                                                            <div className="text-right min-w-[76px]">
                                                                <p className="text-[10px] font-semibold text-gray-500 mb-1">ยอดสุทธิ</p>
                                                                {hasDiscount && (
                                                                    <p className="text-[10px] line-through text-gray-400">฿{originalBill.toLocaleString()}</p>
                                                                )}
                                                                <span className="text-sm font-bold" style={{ color: hasDiscount ? '#7c3aed' : 'var(--gray-700)' }}>
                                                                    ฿{(userBills[ep.user_id] || 0).toLocaleString()}
                                                                </span>
                                                            </div>

                                                            {hasUnfinishedMatches && (
                                                                <span className="badge badge-warning flex items-center gap-1 shrink-0" title="ยังมีแมตช์ที่ยังไม่กดจบ">
                                                                    <Icon icon="solar:clock-circle-bold" width={12} /> ยังไม่จบแมตช์
                                                                </span>
                                                            )}

                                                            <div className="flex flex-col items-end gap-0.5 shrink-0">
                                                                <span className={`badge ${isPaid ? 'badge-success' : 'badge-warning'} shrink-0`}>
                                                                    {isPaid ? (ep.payment_method === 'transfer' ? 'โอนเงิน 📱' : ep.payment_method === 'cash' ? 'เงินสด 💵' : 'จ่ายแล้ว') : 'ยังไม่จ่าย'}
                                                                </span>
                                                                {isPaid && paidTimeText && (
                                                                    <span className="text-[10px] font-semibold text-emerald-700/80 hidden sm:inline-flex items-center gap-0.5" title={`เวลายืนยันชำระเงิน: ${paidTimestamp ? new Date(paidTimestamp).toLocaleString('th-TH') : 'ไม่ระบุ'}`}>
                                                                        <Icon icon="solar:clock-circle-linear" width={11} /> {paidTimeText}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <button
                                                                onClick={() => togglePayment(ep)}
                                                                disabled={isUpdating}
                                                                className={`btn btn-sm whitespace-nowrap ml-auto lg:ml-0 ${isPaid ? 'btn-outline' : hasUnfinishedMatches ? 'btn-secondary border-amber-300 text-amber-700 hover:bg-amber-50' : 'btn-primary'}`}
                                                                style={{ minWidth: '96px', padding: '8px 12px' }}
                                                                title={isPaid ? 'ยกเลิกรายการรับเงิน' : hasUnfinishedMatches ? 'ยังมีแมตช์ค้างอยู่ (กดเพื่อดูรายละเอียด)' : 'บันทึกรับชำระเงิน'}
                                                            >
                                                                {isUpdating ? (
                                                                    <><div className="spinner" style={{ width: 14, height: 14 }} /> บันทึก...</>
                                                                ) : hasUnfinishedMatches ? (
                                                                    <><Icon icon="solar:danger-triangle-linear" width={16} className="text-amber-500" /> รับเงิน</>
                                                                ) : (
                                                                    <><Icon icon={isPaid ? 'solar:undo-left-linear' : 'solar:check-circle-linear'} width={16} /> {isPaid ? 'ยกเลิกรับเงิน' : 'รับเงิน'}</>
                                                                )}
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })}

                                        {visiblePaymentPlayers.length === 0 && (
                                                <div className="text-center py-10 bg-gray-50/30">
                                                    <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
                                                        <Icon icon="solar:magnifer-zoom-out-linear" width={24} className="text-gray-400" />
                                                    </div>
                                                    <p className="text-sm font-bold text-gray-500">ไม่พบผู้เล่นในตัวกรองนี้</p>
                                                    <p className="text-[10px] text-gray-400 mt-1">ลองเปลี่ยนสถานะหรือคำค้นหา</p>
                                                    <button
                                                        type="button"
                                                        onClick={() => { setPaymentFilter('all'); setPaymentSearchQuery(''); }}
                                                        className="btn btn-sm btn-secondary mt-4"
                                                    >
                                                        ล้างตัวกรอง
                                                    </button>
                                                </div>
                                            )}
                                    </div>
                                </div>
                            </div>
                        )}
        </>
    );
}
