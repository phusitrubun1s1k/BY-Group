'use client';

import type { Dispatch, SetStateAction } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@iconify/react';
import CustomSelect from '@/src/components/CustomSelect';
import { GUEST_SKILL_OPTIONS } from './shared';

export interface AddGuestModalProps {
    showAddGuestModal: boolean;
    creating: boolean;
    setShowAddGuestModal: Dispatch<SetStateAction<boolean>>;
    guestName: string;
    setGuestName: Dispatch<SetStateAction<string>>;
    handleAddGuest: () => Promise<string | undefined>;
    guestSkill: string | null;
    setGuestSkill: Dispatch<SetStateAction<string | null>>;
}

export default function AddGuestModal({ showAddGuestModal, creating, setShowAddGuestModal, guestName, setGuestName, handleAddGuest, guestSkill, setGuestSkill }: AddGuestModalProps) {
    return (
        <>
            {showAddGuestModal && typeof document !== 'undefined' && createPortal(
                            <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
                                <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-md" onClick={() => !creating && setShowAddGuestModal(false)} />
                                <div className="card w-full max-w-sm relative z-10 animate-in fade-in zoom-in-95 duration-200" style={{ padding: '24px' }}>

                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(147,51,234,0.1)' }}>
                                            <Icon icon="solar:user-plus-bold" width={20} style={{ color: 'var(--purple-600)' }} />
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-lg" style={{ color: 'var(--gray-900)' }}>เพิ่มขาจร (Guest)</h3>
                                            <p className="text-sm" style={{ color: 'var(--gray-500)' }}>สำหรับผู้เล่นที่ยังไม่มีบัญชีในระบบ</p>
                                        </div>
                                    </div>

                                    <div className="form-group mb-4">
                                        <label className="text-xs font-bold mb-1.5 block" style={{ color: 'var(--gray-700)' }}>ชื่อแสดงผล <span className="text-red-500">*</span></label>
                                        <input
                                            autoFocus
                                            className="form-input"
                                            placeholder="กรอกชื่อขาจร..."
                                            value={guestName}
                                            onChange={(e) => setGuestName(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && handleAddGuest()}
                                        />
                                    </div>

                                    <div className="form-group mb-6">
                                        <CustomSelect
                                            label="ระดับฝีมือ (ไม่บังคับ)"
                                            value={guestSkill || ''}
                                            onChangeAction={(val) => setGuestSkill(val || null)}
                                            options={GUEST_SKILL_OPTIONS}
                                            icon="solar:medal-star-bold"
                                        />
                                    </div>

                                    <div className="flex gap-2">
                                        <button onClick={() => setShowAddGuestModal(false)} disabled={creating} className="btn btn-secondary flex-1">ยกเลิก</button>
                                        <button onClick={handleAddGuest} disabled={creating} className="btn flex-1 bg-purple-600 hover:bg-purple-700 border-none text-white">
                                            {creating ? <div className="spinner" /> : 'เพิ่มผู้เล่นขาจร'}
                                        </button>
                                    </div>
                                </div>
                            </div>,
                            document.body
                        )}
        </>
    );
}
