export type AchievementCategory = 'games' | 'wins' | 'attendance' | 'payment' | 'special';

export interface AchievementTier {
    level: number;
    target: number;
    label: string;
    color: string;
    icon?: string;
    badge?: string;
}

export interface AchievementMetadata {
    id: string;
    name: string;
    description: string;
    icon: string;
    category: AchievementCategory;
    tiers: AchievementTier[];
}

export const ACHIEVEMENTS: AchievementMetadata[] = [
    // 🏸 หมวด: การเล่น (Games)
    {
        id: 'games_count',
        name: 'การเล่น',
        description: 'จำนวนเกมที่ลงเล่นสะสม',
        icon: 'solar:gamepad-old-bold',
        category: 'games',
        tiers: [
            { level: 1, target: 1, label: 'มือใหม่หัดตี', color: '#94a3b8', badge: '🐣', icon: 'solar:gamepad-old-bold' },
            { level: 2, target: 10, label: 'ตีจนมือชา', color: '#10b981', badge: '⚡', icon: 'solar:bolt-circle-bold' },
            { level: 3, target: 50, label: 'ขาประจำ', color: '#3b82f6', badge: '🔥', icon: 'solar:fire-bold' },
            { level: 4, target: 100, label: 'ตำนานสนาม', color: '#f59e0b', badge: '💎', icon: 'solar:diamond-bold' },
            { level: 5, target: 200, label: 'สายเลือดนักตี', color: '#ef4444', badge: '👑', icon: 'solar:crown-bold' },
        ]
    },
    // 🏆 หมวด: ชัยชนะ (Wins)
    {
        id: 'win_count',
        name: 'ชัยชนะ',
        description: 'จำนวนครั้งที่ได้รับชัยชนะ',
        icon: 'solar:cup-bold',
        category: 'wins',
        tiers: [
            { level: 1, target: 1, label: 'ชัยชนะแรก', color: '#94a3b8', badge: '✌️', icon: 'solar:cup-bold' },
            { level: 2, target: 10, label: 'นักล่า', color: '#10b981', badge: '🎯', icon: 'solar:target-bold' },
            { level: 3, target: 50, label: 'สายฆ่า', color: '#3b82f6', badge: '⚔️', icon: 'solar:sword-bold' },
        ]
    },
    {
        id: 'streak_day',
        name: 'ชนะรวดวันเดียว',
        description: 'ชนะติดต่อกันในวันเดียว',
        icon: 'solar:fire-bold',
        category: 'wins',
        tiers: [
            { level: 1, target: 3, label: 'ชนะรวด 3', color: '#f59e0b', badge: '🔥', icon: 'solar:fire-bold' },
        ]
    },
    {
        id: 'streak_wins',
        name: 'ชนะรวดต่อเนื่อง',
        description: 'ชนะติดต่อกันสูงสุด',
        icon: 'solar:ghost-bold',
        category: 'wins',
        tiers: [
            { level: 1, target: 5, label: 'ชนะรวด 5', color: '#ef4444', badge: '💀', icon: 'solar:ghost-bold' },
        ]
    },
    // 📅 หมวด: ความสม่ำเสมอ (Attendance)
    {
        id: 'event_attendance',
        name: 'การเข้าร่วม',
        description: 'จำนวนก๊วนที่เคยเข้าร่วม',
        icon: 'solar:calendar-bold',
        category: 'attendance',
        tiers: [
            { level: 1, target: 5, label: 'มาครบ 5 ก๊วน', color: '#10b981', badge: '📅', icon: 'solar:calendar-bold' },
            { level: 2, target: 20, label: 'บ้านที่สอง', color: '#3b82f6', badge: '🏠', icon: 'solar:home-bold' },
            { level: 3, target: 50, label: 'ไม่เคยขาด', color: '#066d4a', badge: '🫡', icon: 'solar:shield-check-bold' },
        ]
    },
    {
        id: 'early_bird',
        name: 'คนแรกของสนาม',
        description: 'เช็คอินคนแรกของก๊วน',
        icon: 'solar:sunrise-bold',
        category: 'attendance',
        tiers: [
            { level: 1, target: 5, label: 'คนแรกของสนาม', color: '#f59e0b', badge: '🌅', icon: 'solar:sunrise-bold' },
        ]
    },
    // 💰 หมวด: การเงิน (Payment.)
    {
        id: 'paid_on_time',
        name: 'การจ่ายตรงเวลา',
        description: 'จ่ายเงินภายในวันเดียวกัน',
        icon: 'solar:wallet-bold',
        category: 'payment',
        tiers: [
            { level: 1, target: 10, label: 'จ่ายตรงเวลา', color: '#10b981', badge: '💸', icon: 'solar:wallet-bold' },
        ]
    },
    {
        id: 'total_spent',
        name: 'ยอดสะสม',
        description: 'ยอดใช้จ่ายสะสมทั้งหมด',
        icon: 'solar:hand-money-bold',
        category: 'payment',
        tiers: [
            { level: 1, target: 5000, label: 'ผู้อุปถัมภ์', color: '#3b82f6', badge: '🎩', icon: 'solar:hand-money-bold' },
            { level: 2, target: 10000, label: 'ลูกค้า VIP', color: '#f59e0b', badge: '💎', icon: 'solar:star-bold' },
        ]
    },
    // 🎖️ หมวด: พิเศษ (Special)
    {
        id: 'unique_partners',
        name: 'มิตรภาพ',
        description: 'จำนวนคู่หูที่เคยเล่นด้วยกัน',
        icon: 'solar:hand-shake-bold',
        category: 'special',
        tiers: [
            { level: 1, target: 10, label: 'มิตรภาพ', color: '#10b981', badge: '🤝', icon: 'solar:hand-shake-bold' },
        ]
    },
    {
        id: 'birthday_play',
        name: 'วันเกิด',
        description: 'เล่นในวันเกิดตัวเอง',
        icon: 'lucide:cake',
        category: 'special',
        tiers: [
            { level: 1, target: 1, label: 'แฮปปี้เบิร์ดเดย์', color: '#f472b6', badge: '🎂', icon: 'lucide:cake' },
        ]
    },
    {
        id: 'member_status',
        name: 'ขาประจำ',
        description: 'เปลี่ยนจากขาจรเป็นสมาชิก',
        icon: 'solar:user-check-bold',
        category: 'special',
        tiers: [
            { level: 1, target: 1, label: 'ขาจรกลายเป็นขาประจำ', color: '#3b82f6', badge: '🦅', icon: 'solar:user-check-bold' },
        ]
    },
    {
        id: 'og_member',
        name: 'รุ่นแรก',
        description: 'สมาชิกรุ่นบุกเบิก',
        icon: 'solar:star-shine-bold',
        category: 'special',
        tiers: [
            { level: 1, target: 1, label: 'OG', color: '#f59e0b', badge: '🌟', icon: 'solar:star-shine-bold' },
        ]
    },
    {
        id: 'mvp_votes',
        name: 'MVP',
        description: 'ได้รับโหวตให้เป็น MVP',
        icon: 'solar:medal-ribbons-star-bold',
        category: 'special',
        tiers: [
            { level: 1, target: 1, label: 'MVP ประจำเดือน', color: '#ef4444', badge: '🏅', icon: 'solar:medal-ribbons-star-bold' },
        ]
    }
];
