'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/src/lib/supabase/client';
import toast from 'react-hot-toast';
import { Icon } from '@iconify/react';

export default function ResetPasswordPage() {
    const router = useRouter();
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPw, setShowPw] = useState(false);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (password !== confirmPassword) { toast.error('รหัสผ่านไม่ตรงกัน'); return; }
        if (password.length < 6) { toast.error('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร'); return; }

        setLoading(true);
        try {
            const supabase = createClient();
            const { error } = await supabase.auth.updateUser({ password });
            if (error) { toast.error(error.message); return; }
            toast.success('เปลี่ยนรหัสผ่านสำเร็จ');
            router.push('/login');
        } catch { toast.error('เกิดข้อผิดพลาด'); }
        finally { setLoading(false); }
    };

    return (
        <div className="min-h-screen flex items-center justify-center px-4 py-12" style={{ background: 'var(--gray-50)' }}>
            <div className="w-full max-w-sm animate-in">
                <div className="card" style={{ padding: '32px' }}>
                    <div className="text-center mb-6">
                        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-3" style={{ background: 'var(--orange-500)' }}>
                            <Icon icon="solar:lock-keyhole-unlocked-linear" width={24} style={{ color: 'var(--white)' }} />
                        </div>
                        <h1 className="text-xl font-bold" style={{ color: 'var(--gray-900)' }}>ตั้งรหัสผ่านใหม่</h1>
                        <p className="text-sm mt-1" style={{ color: 'var(--gray-500)' }}>กรอกรหัสผ่านใหม่ที่ต้องการ</p>
                    </div>

                    <form onSubmit={handleSubmit}>
                        <div className="form-group">
                            <label className="form-label">รหัสผ่านใหม่</label>
                            <div className="relative">
                                <Icon icon="solar:lock-linear" width={18} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--gray-500)' }} />
                                <input type={showPw ? 'text' : 'password'} className="form-input" placeholder="อย่างน้อย 6 ตัวอักษร" value={password} onChange={(e) => setPassword(e.target.value)} required />
                                <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--gray-500)' }}>
                                    <Icon icon={showPw ? 'solar:eye-closed-linear' : 'solar:eye-linear'} width={18} />
                                </button>
                            </div>
                        </div>
                        <div className="form-group">
                            <label className="form-label">ยืนยันรหัสผ่านใหม่</label>
                            <div className="relative">
                                <Icon icon="solar:lock-linear" width={18} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--gray-500)' }} />
                                <input type={showPw ? 'text' : 'password'} className="form-input" placeholder="กรอกรหัสผ่านอีกครั้ง" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
                            </div>
                        </div>
                        <button type="submit" className="btn btn-primary w-full" disabled={loading}>
                            {loading ? <><div className="spinner" /> กำลังบันทึก...</> : 'บันทึกรหัสผ่านใหม่'}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
