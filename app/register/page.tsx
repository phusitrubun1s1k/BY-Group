'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/src/lib/supabase/client';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { Icon } from '@iconify/react';

const SKILL_GROUPS = [
    {
        label: '🏸 กลุ่มมือใหม่',
        color: '#16a34a',
        bg: 'rgba(22,163,74,0.06)',
        levels: [
            { value: 'เปาะแปะ', label: 'เปาะแปะ', desc: 'ตีเพื่อออกกำลังกาย เน้นสนุกสนาน' },
            { value: 'BG', label: 'BG (Beginner)', desc: 'มือใหม่ฝึกหัด เพิ่งเริ่มจับไม้' },
            { value: 'N', label: 'N (Newbie)', desc: 'เริ่มมีเบสิค โต้ข้ามไปมาได้' },
            { value: 'S', label: 'S (Starter)', desc: 'เริ่มลงแข่งได้ แต่ยังขาดความแม่นยำ' },
        ],
    },
    {
        label: '🏸 กลุ่มเล่นประจำ',
        color: '#2563eb',
        bg: 'rgba(37,99,235,0.06)',
        levels: [
            { value: 'P-', label: 'P- (Practice Minus)', desc: 'ตีประจำ พอตีได้คล่อง' },
            { value: 'P', label: 'P (Practice)', desc: 'ตีดี เริ่มแก้เกมเป็น' },
            { value: 'P+', label: 'P+ (Practice Plus)', desc: 'ตัวตึงก๊วน ทักษะแน่น ตบหนัก' },
        ],
    },
    {
        label: '🏸 กลุ่มแข่งขัน',
        color: '#9333ea',
        bg: 'rgba(147,51,234,0.06)',
        levels: [
            { value: 'C', label: 'C (Intermediate)', desc: 'เดินสายแข่งระดับภูมิภาค' },
            { value: 'B', label: 'B (Advanced)', desc: 'นักกีฬา เร็ว แรง ตบหนักหน่วง' },
            { value: 'A', label: 'A (Professional)', desc: 'มืออาชีพ / ระดับชาติ' },
        ],
    },
];

const allLevels = SKILL_GROUPS.flatMap(g => g.levels.map(l => ({ ...l, groupColor: g.color, groupBg: g.bg })));

export default function RegisterPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [form, setForm] = useState({
        full_name: '', display_name: '', email: '', phone: '',
        skill_level: '' as string, password: '', confirmPassword: '',
    });
    const [showPw, setShowPw] = useState(false);
    const [skillDropdownOpen, setSkillDropdownOpen] = useState(false);
    const skillDropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (skillDropdownRef.current && !skillDropdownRef.current.contains(e.target as Node)) setSkillDropdownOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const updateField = (f: string, v: string) => setForm((p) => ({ ...p, [f]: v }));
    const selectedSkill = allLevels.find(l => l.value === form.skill_level);

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        if (form.password !== form.confirmPassword) { toast.error('รหัสผ่านไม่ตรงกัน'); return; }
        if (form.password.length < 6) { toast.error('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร'); return; }
        if (!form.skill_level) { toast.error('กรุณาเลือกระดับฝีมือ'); return; }

        setLoading(true);
        try {
            const supabase = createClient();
            const { data, error } = await supabase.auth.signUp({ email: form.email, password: form.password });
            if (error) { toast.error(error.message); return; }

            if (data.user) {
                await supabase.from('profiles').upsert({
                    id: data.user.id, email: form.email, full_name: form.full_name,
                    display_name: form.display_name, phone: form.phone,
                    skill_level: form.skill_level, role: 'user',
                });
            }
            toast.success('สมัครสมาชิกสำเร็จ!');
            router.push('/dashboard');
            router.refresh();
        } catch { toast.error('เกิดข้อผิดพลาด'); }
        finally { setLoading(false); }
    };

    return (
        <div className="min-h-screen flex items-center justify-center px-4 py-12 relative bg-white">
            <style>{`
                @keyframes skillDropIn {
                    from { opacity: 0; transform: translateY(-6px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>

            <div className="absolute inset-0 pointer-events-none" style={{
                backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(0,0,0,0.03) 1px, transparent 0)',
                backgroundSize: '24px 24px'
            }} />

            <div className="w-full max-w-lg animate-in relative z-10">
                <div className="card shadow-lg" style={{ padding: '48px 40px' }}>
                    <div className="text-center mb-8">
                        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 shadow-sm" style={{ background: 'var(--orange-500)' }}>
                            <Icon icon="solar:user-plus-linear" width={28} style={{ color: 'var(--white)' }} />
                        </div>
                        <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--gray-900)' }}>สมัครสมาชิก</h1>
                        <p className="text-sm mt-2 font-medium" style={{ color: 'var(--gray-500)' }}>เข้าร่วมก๊วนแบดมินตันของเรา</p>
                    </div>

                    <form onSubmit={handleRegister}>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
                            <div className="form-group">
                                <label className="form-label">ชื่อ-นามสกุล *</label>
                                <input className="form-input form-input-plain" placeholder="ชื่อจริง นามสกุล" value={form.full_name} onChange={(e) => updateField('full_name', e.target.value)} required />
                            </div>
                            <div className="form-group">
                                <label className="form-label">ชื่อเล่น *</label>
                                <input className="form-input form-input-plain" placeholder="ชื่อที่แสดงในระบบ" value={form.display_name} onChange={(e) => updateField('display_name', e.target.value)} required />
                            </div>
                        </div>

                        <div className="form-group">
                            <label className="form-label">อีเมล *</label>
                            <div className="relative">
                                <Icon icon="solar:letter-linear" width={18} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--gray-500)' }} />
                                <input type="email" className="form-input" placeholder="your@email.com" value={form.email} onChange={(e) => updateField('email', e.target.value)} required />
                            </div>
                        </div>

                        <div className="form-group">
                            <label className="form-label">เบอร์โทรศัพท์</label>
                            <input className="form-input form-input-plain" placeholder="08x-xxx-xxxx" value={form.phone} onChange={(e) => updateField('phone', e.target.value)} />
                        </div>

                        {/* Custom Skill Level Dropdown */}
                        <div className="form-group" ref={skillDropdownRef}>
                            <label className="form-label">ระดับฝีมือ *</label>
                            <div className="relative">
                                <button
                                    type="button"
                                    onClick={() => setSkillDropdownOpen(!skillDropdownOpen)}
                                    className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all text-left"
                                    style={{
                                        background: 'var(--white)',
                                        border: `1.5px solid ${skillDropdownOpen ? 'var(--orange-500)' : 'var(--gray-200)'}`,
                                        color: selectedSkill ? 'var(--gray-900)' : 'var(--gray-400)',
                                        boxShadow: skillDropdownOpen ? '0 0 0 3px rgba(249,115,22,0.08)' : '0 1px 2px rgba(0,0,0,0.04)',
                                    }}
                                >
                                    {selectedSkill ? (
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-bold px-1.5 py-0.5 rounded" style={{ background: selectedSkill.groupBg, color: selectedSkill.groupColor }}>{selectedSkill.value}</span>
                                            <span>{selectedSkill.label}</span>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2">
                                            <Icon icon="solar:ranking-linear" width={16} style={{ color: 'var(--gray-400)' }} />
                                            <span>เลือกระดับฝีมือ</span>
                                        </div>
                                    )}
                                    <Icon icon="solar:alt-arrow-down-linear" width={14} style={{ color: 'var(--gray-400)', transform: skillDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                                </button>

                                {skillDropdownOpen && (
                                    <div className="absolute left-0 right-0 mt-2 rounded-xl overflow-hidden z-50" style={{ background: 'var(--white)', border: '1.5px solid var(--gray-200)', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', animation: 'skillDropIn 0.15s ease-out', maxHeight: '340px', overflowY: 'auto' }}>
                                        {SKILL_GROUPS.map((group) => (
                                            <div key={group.label}>
                                                {/* Group Header */}
                                                <div className="px-4 py-2 sticky top-0" style={{ background: group.bg, borderBottom: '1px solid var(--gray-100)' }}>
                                                    <p className="text-[11px] font-bold" style={{ color: group.color }}>{group.label}</p>
                                                </div>
                                                {/* Options */}
                                                {group.levels.map((level) => {
                                                    const isSelected = form.skill_level === level.value;
                                                    return (
                                                        <button key={level.value} type="button"
                                                            onClick={() => { updateField('skill_level', level.value); setSkillDropdownOpen(false); }}
                                                            className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors"
                                                            style={{
                                                                background: isSelected ? group.bg : 'transparent',
                                                                borderBottom: '1px solid var(--gray-50)',
                                                            }}
                                                            onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = 'var(--gray-50)'; }}
                                                            onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                                                        >
                                                            <span className="text-[11px] font-bold px-1.5 py-0.5 rounded shrink-0 w-12 text-center" style={{ background: isSelected ? group.color : 'var(--gray-100)', color: isSelected ? 'white' : group.color }}>
                                                                {level.value}
                                                            </span>
                                                            <div className="flex-1 min-w-0">
                                                                <p className="font-semibold truncate" style={{ color: isSelected ? group.color : 'var(--gray-900)', fontSize: '13px' }}>{level.label}</p>
                                                                <p className="text-[10px] truncate" style={{ color: 'var(--gray-500)' }}>{level.desc}</p>
                                                            </div>
                                                            {isSelected && <Icon icon="solar:check-circle-bold" width={18} style={{ color: group.color }} />}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="form-group">
                            <label className="form-label">รหัสผ่าน *</label>
                            <div className="relative">
                                <Icon icon="solar:lock-linear" width={18} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--gray-500)' }} />
                                <input type={showPw ? 'text' : 'password'} className="form-input" placeholder="อย่างน้อย 6 ตัวอักษร" value={form.password} onChange={(e) => updateField('password', e.target.value)} required />
                                <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--gray-500)' }}>
                                    <Icon icon={showPw ? 'solar:eye-closed-linear' : 'solar:eye-linear'} width={18} />
                                </button>
                            </div>
                        </div>

                        <div className="form-group">
                            <label className="form-label">ยืนยันรหัสผ่าน *</label>
                            <div className="relative">
                                <Icon icon="solar:lock-linear" width={18} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--gray-500)' }} />
                                <input type={showPw ? 'text' : 'password'} className="form-input" placeholder="กรอกรหัสผ่านอีกครั้ง" value={form.confirmPassword} onChange={(e) => updateField('confirmPassword', e.target.value)} required />
                            </div>
                        </div>

                        <button type="submit" className="btn btn-primary w-full mt-4" style={{ padding: '14px', fontSize: '15px' }} disabled={loading}>
                            {loading ? <><div className="spinner" /> กำลังสมัคร...</> : 'สร้างบัญชีผู้ใช้'}
                        </button>
                    </form>

                    <p className="text-center text-sm mt-6 font-medium" style={{ color: 'var(--gray-500)' }}>
                        มีบัญชีอยู่แล้ว? <Link href="/login" className="font-bold transition-colors" style={{ color: 'var(--orange-500)' }}>เข้าสู่ระบบ</Link>
                    </p>
                </div>
            </div>
        </div>
    );
}

