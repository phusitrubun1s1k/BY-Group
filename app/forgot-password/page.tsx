'use client';

import { useState } from 'react';
import { createClient } from '@/src/lib/supabase/client';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { Icon } from '@iconify/react';

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [sent, setSent] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const supabase = createClient();
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}/auth/callback?type=recovery`,
            });
            if (error) { toast.error(error.message); return; }
            setSent(true);
            toast.success('ส่งลิงก์รีเซ็ตรหัสผ่านแล้ว');
        } catch { toast.error('เกิดข้อผิดพลาด'); }
        finally { setLoading(false); }
    };

    return (
        <div className="min-h-screen flex items-center justify-center px-4 py-12" style={{ background: 'var(--gray-50)' }}>
            <div className="w-full max-w-sm animate-in">
                <div className="card" style={{ padding: '32px' }}>
                    {sent ? (
                        <div className="text-center py-4">
                            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-3" style={{ background: 'rgba(22, 163, 74, 0.08)' }}>
                                <Icon icon="solar:check-circle-linear" width={24} style={{ color: 'var(--success)' }} />
                            </div>
                            <h2 className="text-lg font-bold mb-2" style={{ color: 'var(--gray-900)' }}>ส่งอีเมลแล้ว</h2>
                            <p className="text-sm mb-6" style={{ color: 'var(--gray-500)' }}>กรุณาตรวจสอบกล่องข้อความเพื่อรีเซ็ตรหัสผ่าน</p>
                            <Link href="/login" className="btn btn-secondary w-full">กลับไปเข้าสู่ระบบ</Link>
                        </div>
                    ) : (
                        <>
                            <Link href="/login" className="inline-flex items-center gap-1.5 text-sm mb-4" style={{ color: 'var(--gray-500)' }}>
                                <Icon icon="solar:arrow-left-linear" width={16} />
                                กลับไปหน้าเข้าสู่ระบบ
                            </Link>
                            <div className="text-center mb-6">
                                <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-3" style={{ background: 'var(--orange-500)' }}>
                                    <Icon icon="solar:key-linear" width={24} style={{ color: 'var(--white)' }} />
                                </div>
                                <h1 className="text-xl font-bold" style={{ color: 'var(--gray-900)' }}>ลืมรหัสผ่าน</h1>
                                <p className="text-sm mt-1" style={{ color: 'var(--gray-500)' }}>กรอกอีเมลเพื่อรับลิงก์รีเซ็ตรหัสผ่าน</p>
                            </div>
                            <form onSubmit={handleSubmit}>
                                <div className="form-group">
                                    <label className="form-label">อีเมล</label>
                                    <div className="relative">
                                        <Icon icon="solar:letter-linear" width={18} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--gray-500)' }} />
                                        <input type="email" className="form-input" placeholder="your@email.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
                                    </div>
                                </div>
                                <button type="submit" className="btn btn-primary w-full" disabled={loading}>
                                    {loading ? <><div className="spinner" /> กำลังส่ง...</> : 'ส่งลิงก์รีเซ็ตรหัสผ่าน'}
                                </button>
                            </form>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
