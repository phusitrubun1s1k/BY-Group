'use client';

import { useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { createPortal } from 'react-dom';
import type { EventPlayer, Profile } from '@/src/types';
import { Icon } from '@iconify/react';
import RankBadge from '@/src/components/RankBadge';
import { getSkillColor } from './shared';

export interface CheckInPanelProps {
    activeSection: "matches" | "finance";
    showPlayersSidebar: boolean;
    players: EventPlayer[];
    setShowAddGuestModal: Dispatch<SetStateAction<boolean>>;
    setShowAddPlayerModal: Dispatch<SetStateAction<boolean>>;
    searchUnjoinedPlayers: (query?: string) => Promise<void>;
    setShowPlayersSidebar: Dispatch<SetStateAction<boolean>>;
    playerStats: Record<string, { total: number; playing: boolean; matchNums: number[]; }>;
    sidebarTeam: "A" | "B" | null;
    teamA: string[];
    teamB: string[];
    togglePlayer: (userId: string, team: "A" | "B") => void;
    toggleCheckIn: (ep: EventPlayer) => Promise<void>;
    handleRemovePlayer: (epId: string, playerName: string) => Promise<void>;
}

type Kind = 'regular' | 'sub' | 'guest';
type Filter = 'all' | 'in' | 'out';

const KIND_STYLE: Record<Kind, { label: string; color: string; bg: string; icon: string }> = {
    regular: { label: 'สมาชิก', color: 'var(--orange-500)', bg: 'rgba(249,115,22,0.08)', icon: 'solar:users-group-rounded-bold' },
    sub: { label: 'ตัวสำรอง', color: '#3b82f6', bg: 'rgba(59,130,246,0.08)', icon: 'solar:user-hand-up-bold' },
    guest: { label: 'ขาจร (แขก)', color: 'var(--purple-600)', bg: 'rgba(147,51,234,0.08)', icon: 'solar:ghost-bold' },
};

const kindOf = (ep: EventPlayer): Kind => {
    if ((ep.profiles as unknown as Profile)?.is_guest) return 'guest';
    return ep.is_substitute ? 'sub' : 'regular';
};

export default function CheckInPanel({ activeSection, showPlayersSidebar, players, setShowAddGuestModal, setShowAddPlayerModal, searchUnjoinedPlayers, setShowPlayersSidebar, playerStats, sidebarTeam, teamA, teamB, togglePlayer, toggleCheckIn, handleRemovePlayer }: CheckInPanelProps) {
    const [filter, setFilter] = useState<Filter>('all');
    const [search, setSearch] = useState('');

    const checkedIn = players.filter(p => p.is_checked_in).length;
    const paid = players.filter(p => p.payment_status === 'paid').length;
    const pending = players.filter(p => p.payment_status === 'pending').length;
    const pct = players.length ? Math.round((checkedIn / players.length) * 100) : 0;

    // ลำดับกลุ่มเหมือนเดิม: เช็คอิน (สมาชิก → สำรอง → ขาจร) แล้วตามด้วยยังไม่มา (สมาชิก → สำรอง → ขาจร)
    const groups = useMemo(() => {
        const q = search.trim().toLocaleLowerCase('th-TH');
        const match = (ep: EventPlayer) => !q || ((ep.profiles as unknown as Profile)?.display_name || '').toLocaleLowerCase('th-TH').includes(q);
        const kinds: Kind[] = ['regular', 'sub', 'guest'];
        const out: { key: string; title: string; kind: Kind; checked: boolean; items: EventPlayer[] }[] = [];
        for (const checked of [true, false]) {
            if (filter === 'in' && !checked) continue;
            if (filter === 'out' && checked) continue;
            for (const kind of kinds) {
                const items = players.filter(p => !!p.is_checked_in === checked && kindOf(p) === kind && match(p));
                if (items.length) out.push({
                    key: `${checked}-${kind}`,
                    title: checked ? (kind === 'regular' ? 'เช็คอินแล้ว' : `${KIND_STYLE[kind].label} · เช็คอิน`) : (kind === 'regular' ? 'ยังไม่มา' : `${KIND_STYLE[kind].label} · ยังไม่มา`),
                    kind, checked, items,
                });
            }
        }
        return out;
    }, [players, filter, search]);

    if (activeSection !== 'matches' || !showPlayersSidebar || typeof document === 'undefined') return null;

    const close = () => setShowPlayersSidebar(false);

    const renderRow = (ep: EventPlayer, kind: Kind, checked: boolean) => {
        const prof = ep.profiles as unknown as Profile;
        const pstat = playerStats[ep.user_id];
        const isPaid = ep.payment_status === 'paid';
        const isSelected = sidebarTeam === 'A' ? teamA.includes(ep.user_id) : sidebarTeam === 'B' ? teamB.includes(ep.user_id) : false;
        const inOther = (sidebarTeam === 'A' ? teamB : sidebarTeam === 'B' ? teamA : []).includes(ep.user_id);
        const isDisabledSelection = isPaid && !isSelected;
        const teamColor = sidebarTeam === 'A' ? 'var(--orange-500)' : '#3b82f6';
        // ปุ่มลบ: เหมือนเดิม — สมาชิกประจำลบไม่ได้, สำรอง/ขาจรที่ยังไม่มาลบได้เสมอ,
        // ที่เช็คอินแล้วลบได้เมื่อไม่ได้อยู่โหมดเลือกทีมและยังไม่จ่าย
        const canRemove = kind !== 'regular' && (!checked || (!isSelected && !isPaid && !sidebarTeam));
        const ks = KIND_STYLE[kind];

        const onRowClick = () => {
            if (checked && sidebarTeam) {
                if (!isDisabledSelection) togglePlayer(ep.user_id, sidebarTeam);
            } else {
                toggleCheckIn(ep);
            }
        };

        return (
            <div
                key={ep.id}
                onClick={onRowClick}
                className="group flex items-center gap-3 p-2.5 rounded-xl border cursor-pointer transition-all hover:shadow-sm"
                style={{
                    borderColor: isSelected ? teamColor : 'var(--gray-100)',
                    background: isSelected ? (sidebarTeam === 'A' ? 'rgba(249,115,22,0.06)' : 'rgba(59,130,246,0.06)') : 'var(--white, #fff)',
                    opacity: checked ? 1 : 0.65,
                }}
            >
                {/* Check-in toggle */}
                <button
                    onClick={(e) => { e.stopPropagation(); toggleCheckIn(ep); }}
                    title={checked ? 'ยกเลิกเช็คอิน' : 'เช็คอิน'}
                    className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-all"
                    style={checked
                        ? { background: kind === 'guest' ? 'var(--purple-600)' : 'var(--orange-500)', color: '#fff' }
                        : { background: 'var(--gray-100)', border: '1.5px dashed var(--gray-300)', color: 'var(--gray-400)' }}
                >
                    {checked && <Icon icon={kind === 'guest' ? 'solar:ghost-bold' : 'solar:check-read-linear'} width={15} />}
                </button>

                {/* Avatar */}
                <div className="relative shrink-0">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-black text-white" style={{ background: getSkillColor(prof?.skill_level) }}>
                        {(prof?.display_name || '?').charAt(0).toUpperCase()}
                    </div>
                    {pstat?.playing && checked && (
                        <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white bg-orange-500" title="กำลังตี/รอคิว" />
                    )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <p className={`text-sm font-bold truncate ${checked ? 'text-gray-900' : 'text-gray-500'}`}>{prof?.display_name}</p>
                        {kind !== 'regular' && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md" style={{ background: ks.bg, color: ks.color }}>{kind === 'sub' ? 'สำรอง' : 'ขาจร'}</span>
                        )}
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-500">มือ {prof?.skill_level || 'N/A'}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        <RankBadge mmr={prof?.mmr ?? 1000} size="sm" showName={false} showMMR={false} className={checked ? '' : 'opacity-60'} />
                        {checked && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-600">{pstat?.total || 0} เกม</span>
                        )}
                        {checked && pstat?.playing && (
                            <span className="text-[9px] font-bold text-orange-500 px-1.5 py-0.5 rounded-md bg-orange-50">กำลังตี</span>
                        )}
                        {checked && inOther && <span className="text-[9px] font-bold text-red-500">อยู่ทีม {sidebarTeam === 'A' ? 'B' : 'A'}</span>}
                    </div>
                </div>

                {/* Right side */}
                <div className="flex items-center gap-1.5 shrink-0">
                    {checked && (isSelected ? (
                        <Icon icon="solar:check-circle-bold" width={20} style={{ color: teamColor }} />
                    ) : isPaid ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(22,163,74,0.1)', color: 'var(--success)' }}>จ่ายแล้ว</span>
                    ) : (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(234,88,12,0.1)', color: 'var(--warning)' }}>ค้าง</span>
                    ))}
                    {canRemove && (
                        <button
                            onClick={(e) => { e.stopPropagation(); handleRemovePlayer(ep.id, prof.display_name); }}
                            title="ลบออกจากก๊วน"
                            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-red-50 text-gray-300 hover:text-red-500"
                        >
                            <Icon icon="solar:trash-bin-trash-bold" width={16} />
                        </button>
                    )}
                </div>
            </div>
        );
    };

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4">
            <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-md" onClick={close} />
            <div className="card w-full max-w-2xl relative z-10 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200" style={{ padding: 0, maxHeight: '92vh' }}>
                {/* Header */}
                <div className="p-5 pb-4" style={{ background: 'linear-gradient(135deg, rgba(249,115,22,0.08), rgba(249,115,22,0.01))', borderBottom: '1px solid var(--gray-100)' }}>
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <div className="w-11 h-11 rounded-2xl flex items-center justify-center shadow-sm" style={{ background: 'var(--orange-500)' }}>
                                <Icon icon="solar:users-group-rounded-bold" width={22} className="text-white" />
                            </div>
                            <div>
                                <h3 className="text-lg font-black tracking-tight" style={{ color: 'var(--gray-900)' }}>รายชื่อผู้เล่น</h3>
                                <p className="text-xs font-medium" style={{ color: 'var(--gray-500)' }}>
                                    {sidebarTeam ? `กดชื่อเพื่อเลือกเข้าทีม ${sidebarTeam}` : 'กดชื่อเพื่อเช็คอิน / ยกเลิกเช็คอิน'}
                                </p>
                            </div>
                        </div>
                        <button onClick={close} className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/80 transition-colors" aria-label="ปิด">
                            <Icon icon="solar:close-circle-linear" width={24} style={{ color: 'var(--gray-500)' }} />
                        </button>
                    </div>

                    {/* Progress */}
                    <div className="mt-4">
                        <div className="flex items-center justify-between text-xs font-bold mb-1.5">
                            <span style={{ color: 'var(--gray-700)' }}>เช็คอินแล้ว {checkedIn}/{players.length} คน</span>
                            <span style={{ color: 'var(--orange-500)' }}>{pct}%</span>
                        </div>
                        <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--gray-200)' }}>
                            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: 'var(--orange-500)' }} />
                        </div>
                    </div>

                    {/* Stats + actions */}
                    <div className="flex flex-wrap items-center justify-between gap-2 mt-3">
                        <div className="flex items-center gap-1.5">
                            <span className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full" style={{ background: 'rgba(22,163,74,0.1)', color: 'var(--success)' }}>
                                <Icon icon="solar:check-circle-bold" width={12} /> จ่าย {paid}
                            </span>
                            <span className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full" style={{ background: 'rgba(234,88,12,0.1)', color: 'var(--warning)' }}>
                                <Icon icon="solar:clock-circle-linear" width={12} /> ค้าง {pending}
                            </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <button onClick={() => setShowAddGuestModal(true)} className="px-3 py-1.5 rounded-lg bg-white hover:bg-purple-50 border border-gray-200 text-xs font-black flex items-center gap-1 transition-colors" style={{ color: 'var(--purple-600)' }}>
                                <Icon icon="solar:user-plus-bold" width={15} /> แอดขาจร
                            </button>
                            <button onClick={() => { setShowAddPlayerModal(true); searchUnjoinedPlayers(''); }} className="px-3 py-1.5 rounded-lg bg-white hover:bg-orange-50 border border-gray-200 text-xs font-black flex items-center gap-1 transition-colors" style={{ color: 'var(--orange-500)' }}>
                                <Icon icon="solar:users-group-rounded-bold" width={15} /> เพิ่มผู้เล่น
                            </button>
                        </div>
                    </div>
                </div>

                {/* Search + filter */}
                <div className="flex flex-col sm:flex-row gap-2 px-4 pt-3 pb-2">
                    <div className="relative flex-1">
                        <Icon icon="solar:magnifer-linear" width={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหาชื่อผู้เล่น" className="form-input w-full" style={{ paddingLeft: '34px' }} />
                    </div>
                    <div className="flex rounded-xl p-1" style={{ background: 'var(--gray-100)' }}>
                        {([['all', 'ทั้งหมด'], ['in', 'เช็คอิน'], ['out', 'ยังไม่มา']] as [Filter, string][]).map(([v, label]) => (
                            <button key={v} type="button" onClick={() => setFilter(v)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${filter === v ? 'bg-white shadow-sm text-orange-600' : 'text-gray-500'}`}>
                                {label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* List */}
                <div className="overflow-y-auto px-4 pb-4" style={{ minHeight: 0 }}>
                    {groups.length === 0 && (
                        <div className="text-center py-12">
                            <Icon icon="solar:user-cross-linear" width={36} className="mx-auto text-gray-300 mb-2" />
                            <p className="text-sm font-bold text-gray-400">{search ? 'ไม่พบผู้เล่นที่ค้นหา' : 'ยังไม่มีผู้เล่นในกลุ่มนี้'}</p>
                        </div>
                    )}
                    {groups.map(g => {
                        const ks = KIND_STYLE[g.kind];
                        return (
                            <div key={g.key} className="mt-3 first:mt-1">
                                <div className="flex items-center gap-2 mb-2 sticky top-0 z-[1] py-1" style={{ background: 'var(--card-bg, var(--white, #fff))' }}>
                                    <Icon icon={g.checked ? ks.icon : 'solar:clock-circle-linear'} width={14} style={{ color: g.checked ? ks.color : 'var(--gray-400)' }} />
                                    <p className="text-[11px] font-black uppercase tracking-wider" style={{ color: g.checked ? ks.color : 'var(--gray-400)' }}>{g.title}</p>
                                    <span className="text-[10px] font-bold px-1.5 rounded-full" style={{ background: g.checked ? ks.bg : 'var(--gray-100)', color: g.checked ? ks.color : 'var(--gray-500)' }}>{g.items.length}</span>
                                    <div className="flex-1 h-px" style={{ background: 'var(--gray-100)' }} />
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {g.items.map(ep => renderRow(ep, g.kind, g.checked))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>,
        document.body
    );
}
