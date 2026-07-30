'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@iconify/react';
import { createClient } from '@/src/lib/supabase/client';
import RankBadge from '@/src/components/RankBadge';

export interface Champion {
    user_id: string;
    display_name: string;
    mmr: number;
    skill_level?: string | null;
}

// ธีมกรอบทอง/เงิน/ทองแดง — ใช้ร่วมกันทุกหน้าให้ Top 1/2/3 หน้าตาเหมือนกัน
export const PODIUM_FRAME: Record<1 | 2 | 3, {
    label: string;
    icon: string;
    color: string;
    border: string;
    gradient: string;
    glow: string;
    medalBg: string;
}> = {
    1: {
        label: 'แชมป์',
        icon: 'solar:crown-bold',
        color: '#b45309',
        border: '#fbbf24',
        gradient: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 55%, #fde68a 100%)',
        glow: '0 8px 28px rgba(245,158,11,0.35)',
        medalBg: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
    },
    2: {
        label: 'รอง 1',
        icon: 'solar:medal-ribbons-star-bold',
        color: '#475569',
        border: '#cbd5e1',
        gradient: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 60%, #e2e8f0 100%)',
        glow: '0 6px 20px rgba(148,163,184,0.28)',
        medalBg: 'linear-gradient(135deg, #cbd5e1, #94a3b8)',
    },
    3: {
        label: 'รอง 2',
        icon: 'solar:medal-star-bold',
        color: '#9a3412',
        border: '#fdba74',
        gradient: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 60%, #fed7aa 100%)',
        glow: '0 6px 20px rgba(217,119,6,0.25)',
        medalBg: 'linear-gradient(135deg, #fdba74, #d97706)',
    },
};

/** กรอบผู้เล่น 1 คน (แถวแนวนอน) ใช้ในกระดานคิว/sidebar */
export function ChampionFrame({ entry, rank, isMe }: { entry: Champion; rank: 1 | 2 | 3; isMe?: boolean }) {
    const f = PODIUM_FRAME[rank];
    return (
        <Link
            href={isMe ? '/dashboard/profile' : `/dashboard/profile/${entry.user_id}`}
            className="relative flex items-center gap-3 rounded-2xl p-3 border-2 overflow-hidden group transition-transform hover:scale-[1.02]"
            style={{ borderColor: f.border, background: f.gradient, boxShadow: f.glow }}
        >
            {/* แสงวิ่ง (เฉพาะอันดับ 1) */}
            {rank === 1 && (
                <span className="champ-shine absolute inset-0 pointer-events-none" aria-hidden />
            )}

            {/* เหรียญ / มงกุฎ */}
            <div className="relative shrink-0">
                <div
                    className="w-11 h-11 rounded-2xl flex items-center justify-center text-white font-black text-lg shadow-md"
                    style={{ background: f.medalBg }}
                >
                    {rank}
                </div>
                {rank === 1 && (
                    <Icon icon="solar:crown-bold" width={20} className="absolute -top-2.5 left-1/2 -translate-x-1/2 drop-shadow" style={{ color: '#f59e0b' }} />
                )}
            </div>

            {/* อวาตาร์ */}
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-black text-white shrink-0 shadow-inner border-2 border-white" style={{ background: f.medalBg }}>
                {entry.display_name.charAt(0).toUpperCase()}
            </div>

            {/* ชื่อ + แรงค์ */}
            <div className="flex-1 min-w-0 relative z-10">
                <div className="flex items-center gap-1.5">
                    <p className="text-sm font-black truncate" style={{ color: 'var(--gray-900)' }}>{entry.display_name}</p>
                    {isMe && <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-orange-500 text-white shrink-0">คุณ</span>}
                </div>
                <div className="mt-1">
                    <RankBadge mmr={entry.mmr || 1000} size="sm" showName showMMR={false} />
                </div>
            </div>

            {/* คะแนน MMR */}
            <div className="text-right shrink-0 relative z-10">
                <p className="text-lg font-black leading-none tabular-nums" style={{ color: f.color }}>{entry.mmr}</p>
                <p className="text-[9px] font-bold uppercase tracking-widest opacity-60" style={{ color: f.color }}>MMR</p>
            </div>
        </Link>
    );
}

/** การ์ด "แชมป์ประจำก๊วน" — ดึง Top 3 (MMR สูงสุด) มาแสดงเอง ใช้แปะได้เลย */
export default function ChampionsPodium({ currentUserId }: { currentUserId?: string | null }) {
    const [top, setTop] = useState<Champion[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function load() {
            const supabase = createClient();
            const { data } = await supabase
                .from('view_leaderboard')
                .select('user_id, display_name, mmr, skill_level, total_games')
                .gt('total_games', 0)
                .order('mmr', { ascending: false })
                .limit(3);
            setTop((data || []) as Champion[]);
            setLoading(false);
        }
        load();
    }, []);

    if (loading) {
        return (
            <div className="card p-6 border-none shadow-xl flex items-center justify-center min-h-[160px]">
                <div className="spinner" style={{ width: 24, height: 24 }} />
            </div>
        );
    }

    if (top.length === 0) return null;

    return (
        <div className="card border-none shadow-xl overflow-hidden" style={{ padding: 0 }}>
            <style>{`
                @keyframes champShine {
                    0% { transform: translateX(-120%) skewX(-20deg); }
                    60%, 100% { transform: translateX(220%) skewX(-20deg); }
                }
                .champ-shine::before {
                    content: '';
                    position: absolute;
                    top: 0; left: 0; height: 100%; width: 40%;
                    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.65), transparent);
                    animation: champShine 3.2s ease-in-out infinite;
                }
            `}</style>

            {/* Header */}
            <div className="p-5 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #111827, #1f2937)' }}>
                <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full" style={{ background: 'radial-gradient(circle, rgba(245,158,11,0.4), transparent 70%)' }} />
                <div className="flex items-center gap-3 relative z-10">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg" style={{ background: 'linear-gradient(135deg, #fbbf24, #f59e0b)' }}>
                        <Icon icon="solar:cup-star-bold" width={22} className="text-white" />
                    </div>
                    <div>
                        <h3 className="text-white font-black tracking-tight leading-none">แชมป์ประจำก๊วน</h3>
                        <p className="text-gray-400 text-xs font-bold mt-1">3 อันดับ MMR สูงสุด 🏆</p>
                    </div>
                </div>
            </div>

            {/* Frames */}
            <div className="p-4 bg-white flex flex-col gap-3">
                {top.map((entry, i) => (
                    <ChampionFrame key={entry.user_id} entry={entry} rank={(i + 1) as 1 | 2 | 3} isMe={entry.user_id === currentUserId} />
                ))}
            </div>
        </div>
    );
}
