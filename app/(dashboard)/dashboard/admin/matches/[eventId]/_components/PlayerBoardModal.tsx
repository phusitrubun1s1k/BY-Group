'use client';

import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@iconify/react';
import type { EventPlayer, Match, Profile } from '@/src/types';
import { getSkillColor } from './shared';

interface PlayerBoardModalProps {
    open: boolean;
    onClose: () => void;
    players: EventPlayer[];
    matches: Match[];
}

type PlayerState = 'playing' | 'waiting' | 'idle';

interface BoardRow {
    userId: string;
    name: string;
    skill: string | null | undefined;
    isGuest: boolean;
    isSubstitute: boolean;
    checkedIn: boolean;
    played: number;      // เกมที่ลงแล้ว (กำลังเล่น + จบแล้ว)
    queued: number;      // เกมที่รอคิวอยู่
    state: PlayerState;
    lastMatchNum: number | null;
}

const STATE_LABEL: Record<PlayerState, { text: string; color: string; bg: string }> = {
    playing: { text: 'กำลังเล่น', color: '#16a34a', bg: 'rgba(22,163,74,0.1)' },
    waiting: { text: 'รอคิว', color: '#2563eb', bg: 'rgba(37,99,235,0.1)' },
    idle: { text: 'ว่าง', color: 'var(--gray-500)', bg: 'var(--gray-100)' },
};

export default function PlayerBoardModal({ open, onClose, players, matches }: PlayerBoardModalProps) {
    const [checkedInOnly, setCheckedInOnly] = useState(true);
    const [search, setSearch] = useState('');

    const rows = useMemo<BoardRow[]>(() => {
        const map: Record<string, BoardRow> = {};
        players.forEach(p => {
            const prof = p.profiles as unknown as Profile | undefined;
            map[p.user_id] = {
                userId: p.user_id,
                name: prof?.display_name || 'ไม่ทราบชื่อ',
                skill: prof?.skill_level,
                isGuest: !!prof?.is_guest,
                isSubstitute: !!p.is_substitute,
                checkedIn: !!p.is_checked_in,
                played: 0, queued: 0, state: 'idle', lastMatchNum: null,
            };
        });
        matches.forEach((m, idx) => {
            const num = m.match_number || idx + 1;
            m.match_players?.forEach(mp => {
                const r = map[mp.user_id];
                if (!r) return;
                if (m.status === 'playing' || m.status === 'finished') {
                    r.played++;
                    r.lastMatchNum = Math.max(r.lastMatchNum ?? 0, num);
                }
                if (m.status === 'waiting') r.queued++;
                if (m.status === 'playing') r.state = 'playing';
                else if (m.status === 'waiting' && r.state !== 'playing') r.state = 'waiting';
            });
        });
        return Object.values(map);
    }, [players, matches]);

    const visible = useMemo(() => {
        const q = search.trim().toLocaleLowerCase('th-TH');
        return rows
            .filter(r => !checkedInOnly || r.checkedIn)
            .filter(r => !q || r.name.toLocaleLowerCase('th-TH').includes(q))
            // เล่นน้อยสุดขึ้นก่อน → คนว่างก่อนคนที่มีคิว → ชื่อ
            .sort((a, b) =>
                (a.played + a.queued) - (b.played + b.queued)
                || (a.state === 'idle' ? 0 : 1) - (b.state === 'idle' ? 0 : 1)
                || a.name.localeCompare(b.name, 'th'));
    }, [rows, checkedInOnly, search]);

    const base = rows.filter(r => !checkedInOnly || r.checkedIn);
    const counts = base.map(r => r.played);
    const minPlayed = counts.length ? Math.min(...counts) : 0;
    const maxPlayed = counts.length ? Math.max(...counts) : 0;
    const avgPlayed = counts.length ? counts.reduce((s, n) => s + n, 0) / counts.length : 0;
    const neverPlayed = base.filter(r => r.played === 0 && r.queued === 0).length;
    const idleNow = base.filter(r => r.state === 'idle').length;

    if (!open || typeof document === 'undefined') return null;

    return createPortal(
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-md" onClick={onClose} />
            <div className="card w-full max-w-2xl relative z-10 flex flex-col animate-in fade-in zoom-in-95 duration-200" style={{ padding: 0, maxHeight: '90vh' }}>
                {/* Header */}
                <div className="flex items-center justify-between gap-3 p-5 border-b" style={{ borderColor: 'var(--gray-100)' }}>
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(249,115,22,0.1)' }}>
                            <Icon icon="solar:clipboard-list-bold-duotone" width={22} style={{ color: 'var(--orange-500)' }} />
                        </div>
                        <div>
                            <h3 className="font-bold text-lg" style={{ color: 'var(--gray-900)' }}>กระดานผู้เล่น</h3>
                            <p className="text-xs" style={{ color: 'var(--gray-500)' }}>เรียงจากคนที่เล่นน้อยที่สุด กันตกหล่นตอนจัดแมตช์</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-gray-100" aria-label="ปิด">
                        <Icon icon="solar:close-circle-linear" width={22} style={{ color: 'var(--gray-500)' }} />
                    </button>
                </div>

                {/* Summary */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-4">
                    <div className="rounded-xl p-3" style={{ background: neverPlayed ? 'rgba(220,38,38,0.08)' : 'var(--gray-50)' }}>
                        <p className="text-[11px] font-semibold" style={{ color: 'var(--gray-500)' }}>ยังไม่ได้เล่น</p>
                        <p className="text-xl font-black" style={{ color: neverPlayed ? '#dc2626' : 'var(--gray-900)' }}>{neverPlayed} <span className="text-xs font-semibold">คน</span></p>
                    </div>
                    <div className="rounded-xl p-3" style={{ background: 'var(--gray-50)' }}>
                        <p className="text-[11px] font-semibold" style={{ color: 'var(--gray-500)' }}>ว่างตอนนี้</p>
                        <p className="text-xl font-black" style={{ color: 'var(--gray-900)' }}>{idleNow} <span className="text-xs font-semibold">คน</span></p>
                    </div>
                    <div className="rounded-xl p-3" style={{ background: 'var(--gray-50)' }}>
                        <p className="text-[11px] font-semibold" style={{ color: 'var(--gray-500)' }}>น้อยสุด / มากสุด</p>
                        <p className="text-xl font-black" style={{ color: 'var(--gray-900)' }}>{minPlayed} / {maxPlayed} <span className="text-xs font-semibold">ตา</span></p>
                    </div>
                    <div className="rounded-xl p-3" style={{ background: 'var(--gray-50)' }}>
                        <p className="text-[11px] font-semibold" style={{ color: 'var(--gray-500)' }}>เฉลี่ย</p>
                        <p className="text-xl font-black" style={{ color: 'var(--gray-900)' }}>{avgPlayed.toFixed(1)} <span className="text-xs font-semibold">ตา</span></p>
                    </div>
                </div>

                {/* Filters */}
                <div className="flex flex-col sm:flex-row gap-2 px-4 pb-3">
                    <div className="relative flex-1">
                        <Icon icon="solar:magnifer-linear" width={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="ค้นหาชื่อ"
                            className="form-input w-full"
                            style={{ paddingLeft: '34px' }}
                        />
                    </div>
                    <div className="flex rounded-xl p-1" style={{ background: 'var(--gray-100)' }}>
                        {[{ v: true, label: 'เช็คอินแล้ว' }, { v: false, label: 'ทั้งหมด' }].map(opt => (
                            <button
                                key={opt.label}
                                type="button"
                                onClick={() => setCheckedInOnly(opt.v)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold ${checkedInOnly === opt.v ? 'bg-white shadow-sm text-orange-600' : 'text-gray-500'}`}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* List */}
                <div className="overflow-y-auto px-4 pb-4 space-y-1.5" style={{ minHeight: 0 }}>
                    {visible.length === 0 && (
                        <p className="text-center text-sm py-10" style={{ color: 'var(--gray-400)' }}>
                            {checkedInOnly ? 'ยังไม่มีผู้เล่นเช็คอิน' : 'ไม่พบผู้เล่น'}
                        </p>
                    )}
                    {visible.map((r, i) => {
                        const st = STATE_LABEL[r.state];
                        const lowest = r.played === minPlayed && maxPlayed > minPlayed;
                        const none = r.played === 0 && r.queued === 0;
                        const barPct = maxPlayed > 0 ? Math.round((r.played / maxPlayed) * 100) : 0;
                        return (
                            <div
                                key={r.userId}
                                className="flex items-center gap-3 rounded-xl p-2.5 border"
                                style={{
                                    borderColor: none ? 'rgba(220,38,38,0.35)' : lowest ? 'rgba(249,115,22,0.35)' : 'var(--gray-100)',
                                    background: none ? 'rgba(220,38,38,0.04)' : 'transparent',
                                }}
                            >
                                <span className="w-6 text-center text-xs font-bold" style={{ color: 'var(--gray-400)' }}>{i + 1}</span>
                                <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0" style={{ background: getSkillColor(r.skill) }}>
                                    {r.name.charAt(0).toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="font-bold text-sm truncate" style={{ color: 'var(--gray-900)' }}>{r.name}</span>
                                        {r.skill && <span className="text-[10px] font-bold px-1.5 rounded" style={{ color: getSkillColor(r.skill), background: 'var(--gray-50)' }}>{r.skill}</span>}
                                        {r.isGuest && <span className="text-[10px] font-bold px-1.5 rounded bg-purple-50 text-purple-600">ขาจร</span>}
                                        {r.isSubstitute && <span className="text-[10px] font-bold px-1.5 rounded bg-yellow-50 text-yellow-700">สำรอง</span>}
                                        {!r.checkedIn && <span className="text-[10px] font-bold px-1.5 rounded bg-gray-100 text-gray-500">ยังไม่เช็คอิน</span>}
                                    </div>
                                    <div className="mt-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--gray-100)' }}>
                                        <div className="h-full rounded-full" style={{ width: `${barPct}%`, background: 'var(--orange-500)' }} />
                                    </div>
                                    <p className="text-[10px] mt-0.5" style={{ color: 'var(--gray-400)' }}>
                                        {none ? 'ยังไม่ได้ลงเล่นเลย' : r.lastMatchNum ? `เล่นล่าสุดแมตช์ #${r.lastMatchNum}` : 'ยังไม่จบตาแรก'}
                                        {r.queued > 0 && ` · มีคิวรอ ${r.queued} แมตช์`}
                                    </p>
                                </div>
                                <span className="text-[11px] font-bold px-2 py-1 rounded-full shrink-0" style={{ color: st.color, background: st.bg }}>{st.text}</span>
                                <div className="text-right w-12 shrink-0">
                                    <p className="text-lg font-black leading-none" style={{ color: none ? '#dc2626' : 'var(--gray-900)' }}>{r.played}</p>
                                    <p className="text-[10px]" style={{ color: 'var(--gray-400)' }}>ตา</p>
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
