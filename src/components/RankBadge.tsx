'use client';

import { Icon } from '@iconify/react';
import { getRankFromMMR, RankTier } from '@/src/lib/rank-utils';

interface RankBadgeProps {
    mmr: number;
    showName?: boolean;
    showMMR?: boolean;
    size?: 'sm' | 'md' | 'lg';
    className?: string;
}

export default function RankBadge({ mmr, showName = true, showMMR = true, size = 'md', className = '' }: RankBadgeProps) {
    const rank = getRankFromMMR(mmr);

    const sizeMap = {
        sm: {
            icon: 16,
            container: 'px-1.5 py-0.5 rounded text-[9px]',
            gap: 'gap-1'
        },
        md: {
            icon: 20,
            container: 'px-2 py-1 rounded-lg text-[10px]',
            gap: 'gap-1.5'
        },
        lg: {
            icon: 24,
            container: 'px-3 py-1.5 rounded-xl text-xs',
            gap: 'gap-2'
        }
    };

    const s = sizeMap[size];

    return (
        <div className={`inline-flex items-center ${s.gap} ${rank.bg} ${rank.border} border ${rank.text} font-black uppercase tracking-wider ${s.container} ${className} shadow-sm`}>
            <Icon icon={rank.icon} width={s.icon} style={{ color: rank.color }} />
            <div className="flex flex-col leading-none">
                {showName && <span>{rank.name}</span>}
                {showMMR && <span className="text-[8px] opacity-70 mt-0.5">Rating: {mmr}</span>}
            </div>
        </div>
    );
}
