export interface RankTier {
    name: string;
    minMMR: number;
    color: string;
    icon: string;
    bg: string;
    border: string;
    text: string;
}

export const RANK_TIERS: RankTier[] = [
    {
        name: 'Iron',
        minMMR: 0,
        color: '#94a3b8',
        icon: 'solar:shield-minimalistic-bold',
        bg: 'bg-slate-100',
        border: 'border-slate-200',
        text: 'text-slate-500'
    },
    {
        name: 'Bronze',
        minMMR: 1200,
        color: '#b45309',
        icon: 'solar:shield-bold',
        bg: 'bg-amber-50',
        border: 'border-amber-200',
        text: 'text-amber-700'
    },
    {
        name: 'Silver',
        minMMR: 1600,
        color: '#64748b',
        icon: 'solar:medal-star-bold',
        bg: 'bg-slate-50',
        border: 'border-slate-300',
        text: 'text-slate-600'
    },
    {
        name: 'Gold',
        minMMR: 2000,
        color: '#eab308',
        icon: 'solar:cup-star-bold',
        bg: 'bg-yellow-50',
        border: 'border-yellow-300',
        text: 'text-yellow-700'
    },
    {
        name: 'Platinum',
        minMMR: 2400,
        color: '#0ea5e9',
        icon: 'solar:crown-minimalistic-bold',
        bg: 'bg-sky-50',
        border: 'border-sky-300',
        text: 'text-sky-600'
    },
    {
        name: 'Diamond',
        minMMR: 2800,
        color: '#8b5cf6',
        icon: 'solar:magic-stick-3-bold',
        bg: 'bg-violet-50',
        border: 'border-violet-300',
        text: 'text-violet-600'
    },
    {
        name: 'Master',
        minMMR: 3200,
        color: '#f43f5e',
        icon: 'solar:fire-bold',
        bg: 'bg-rose-50',
        border: 'border-rose-300',
        text: 'text-rose-600'
    },
    {
        name: 'Grandmaster',
        minMMR: 3600,
        color: '#fbbf24',
        icon: 'solar:crown-star-bold',
        bg: 'bg-amber-100',
        border: 'border-amber-400',
        text: 'text-amber-600'
    }
];

export const getRankFromMMR = (mmr: number): RankTier => {
    for (let i = RANK_TIERS.length - 1; i >= 0; i--) {
        if (mmr >= RANK_TIERS[i].minMMR) {
            return RANK_TIERS[i];
        }
    }
    return RANK_TIERS[0];
};

export const getNextRank = (mmr: number): { rank: RankTier | null, pointsNeeded: number, progress: number } => {
    const currentRank = getRankFromMMR(mmr);
    const currentIndex = RANK_TIERS.findIndex(r => r.name === currentRank.name);

    if (currentIndex === RANK_TIERS.length - 1) {
        return { rank: null, pointsNeeded: 0, progress: 100 };
    }

    const nextRank = RANK_TIERS[currentIndex + 1];
    const pointsNeeded = nextRank.minMMR - mmr;
    const range = nextRank.minMMR - currentRank.minMMR;
    const progress = Math.min(100, Math.max(0, ((mmr - currentRank.minMMR) / range) * 100));

    return { rank: nextRank, pointsNeeded, progress };
};
