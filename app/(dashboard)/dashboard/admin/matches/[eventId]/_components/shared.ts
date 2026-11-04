import type { SelectOption } from '@/src/components/CustomSelect';

export const GUEST_SKILL_OPTIONS: SelectOption[] = [
    { value: '', label: '-- เลือกระดับ --', icon: 'solar:question-circle-linear' },
    { value: 'เปาะแปะ', label: 'เปาะแปะ', icon: 'solar:user-linear' },
    { value: 'BG', label: 'BG', icon: 'solar:user-bold' },
    { value: 'N', label: 'N', icon: 'solar:user-bold-duotone' },
    { value: 'S', label: 'S', icon: 'solar:medal-star-linear' },
    { value: 'P-', label: 'P-', icon: 'solar:medal-star-bold' },
    { value: 'P', label: 'P', icon: 'solar:cup-star-linear' },
    { value: 'P+', label: 'P+', icon: 'solar:cup-star-bold' },
    { value: 'C', label: 'C', icon: 'solar:crown-minimalistic-linear' },
    { value: 'B', label: 'B', icon: 'solar:crown-bold' },
    { value: 'A', label: 'A', icon: 'solar:crown-star-bold' },
];

export const getSkillColor = (level: string | null | undefined) => {
    if (['เปาะแปะ', 'BG', 'N', 'S'].includes(level || '')) return '#16a34a';
    if (['P-', 'P', 'P+'].includes(level || '')) return '#2563eb';
    if (['C', 'B', 'A'].includes(level || '')) return '#9333ea';
    return '#6b7280'; // fallback
};
