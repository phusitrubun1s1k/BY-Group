'use client';

import type { Dispatch, SetStateAction } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@iconify/react';

export interface AddShuttlecockModalProps {
    addingShuttlecockMatch: { id: string; currentNumbers: string[]; updatedAt: string; } | null;
    creating: boolean;
    setAddingShuttlecockMatch: Dispatch<SetStateAction<{ id: string; currentNumbers: string[]; updatedAt: string; } | null>>;
    newShuttlecockNumber: string;
    setNewShuttlecockNumber: Dispatch<SetStateAction<string>>;
    submitAddShuttlecock: () => Promise<void>;
}

export default function AddShuttlecockModal({ addingShuttlecockMatch, creating, setAddingShuttlecockMatch, newShuttlecockNumber, setNewShuttlecockNumber, submitAddShuttlecock }: AddShuttlecockModalProps) {
    return (
        <>
            {addingShuttlecockMatch && typeof document !== 'undefined' && createPortal(
                            <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
                                <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-md" onClick={() => !creating && setAddingShuttlecockMatch(null)} />
                                <div className="card w-full max-w-sm relative z-10 animate-in fade-in zoom-in-95 duration-200" style={{ padding: '24px' }}>
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(249,115,22,0.1)' }}>
                                            <Icon icon="solar:shuttlecock-linear" width={20} style={{ color: 'var(--orange-500)' }} />
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-lg" style={{ color: 'var(--gray-900)' }}>เบิกลูกแบดเพิ่ม</h3>
                                            <p className="text-sm" style={{ color: 'var(--gray-500)' }}>ระบุหมายเลขลูกที่เบิก</p>
                                        </div>
                                    </div>

                                    <div className="form-group mb-6">
                                        <input
                                            autoFocus
                                            className="form-input"
                                            placeholder="ตัวอย่าง: 12"
                                            value={newShuttlecockNumber}
                                            onChange={(e) => setNewShuttlecockNumber(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && submitAddShuttlecock()}
                                        />
                                    </div>

                                    <div className="flex gap-2">
                                        <button onClick={() => setAddingShuttlecockMatch(null)} disabled={creating} className="btn btn-secondary flex-1">ยกเลิก</button>
                                        <button onClick={submitAddShuttlecock} disabled={creating} className="btn btn-primary flex-1 bg-orange-500 hover:bg-orange-600 border-none text-white">
                                            {creating ? <div className="spinner" /> : 'ยืนยัน'}
                                        </button>
                                    </div>
                                </div>
                            </div>,
                            document.body
                        )}
        </>
    );
}
