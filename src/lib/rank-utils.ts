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
        name: 'Wood',
        minMMR: 0,
        color: '#78350f',
        icon: 'solar:shield-cross-bold',
        bg: 'bg-amber-50',
        border: 'border-amber-200',
        text: 'text-amber-900'
    },
    {
        name: 'Stone',
        minMMR: 400,
        color: '#4b5563',
        icon: 'solar:shield-minimalistic-bold',
        bg: 'bg-gray-100',
        border: 'border-gray-300',
        text: 'text-gray-700'
    },
    {
        name: 'Coal',
        minMMR: 750,
        color: '#1f2937',
        icon: 'solar:shield-bold',
        bg: 'bg-slate-200',
        border: 'border-slate-400',
        text: 'text-slate-800'
    },
    {
        name: 'Iron',
        minMMR: 1000,
        color: '#94a3b8',
        icon: 'solar:shield-up-bold',
        bg: 'bg-slate-50',
        border: 'border-slate-200',
        text: 'text-slate-600'
    },
    {
        name: 'Bronze',
        minMMR: 1300,
        color: '#b45309',
        icon: 'solar:medal-ribbon-bold',
        bg: 'bg-orange-50',
        border: 'border-orange-200',
        text: 'text-orange-800'
    },
    {
        name: 'Silver',
        minMMR: 1650,
        color: '#64748b',
        icon: 'solar:medal-star-bold',
        bg: 'bg-blue-50',
        border: 'border-blue-200',
        text: 'text-blue-700'
    },
    {
        name: 'Gold',
        minMMR: 2000,
        color: '#ca8a04',
        icon: 'solar:cup-star-bold',
        bg: 'bg-yellow-50',
        border: 'border-yellow-300',
        text: 'text-yellow-800'
    },
    {
        name: 'Platinum',
        minMMR: 2400,
        color: '#0ea5e9',
        icon: 'solar:crown-minimalistic-bold',
        bg: 'bg-sky-50',
        border: 'border-sky-300',
        text: 'text-sky-700'
    },
    {
        name: 'Emerald',
        minMMR: 2850,
        color: '#10b981',
        icon: 'solar:star-bold',
        bg: 'bg-emerald-50',
        border: 'border-emerald-300',
        text: 'text-emerald-700'
    },
    {
        name: 'Diamond',
        minMMR: 3300,
        color: '#8b5cf6',
        icon: 'solar:magic-stick-3-bold',
        bg: 'bg-violet-50',
        border: 'border-violet-300',
        text: 'text-violet-700'
    },
    {
        name: 'Master',
        minMMR: 3800,
        color: '#f43f5e',
        icon: 'solar:fire-bold',
        bg: 'bg-rose-50',
        border: 'border-rose-300',
        text: 'text-rose-700'
    },
    {
        name: 'Grandmaster',
        minMMR: 4300,
        color: '#fbbf24',
        icon: 'solar:crown-star-bold',
        bg: 'bg-amber-50',
        border: 'border-amber-400',
        text: 'text-amber-800'
    },
    {
        name: 'Challenger',
        minMMR: 4800,
        color: '#ec4899',
        icon: 'solar:star-rainbow-bold',
        bg: 'bg-pink-50',
        border: 'border-pink-300',
        text: 'text-pink-700'
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
