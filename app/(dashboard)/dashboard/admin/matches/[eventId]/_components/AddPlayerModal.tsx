'use client';

import type { Dispatch, SetStateAction } from 'react';
import { createPortal } from 'react-dom';
import type { Profile } from '@/src/types';
import { Icon } from '@iconify/react';
import { truncateName } from '@/src/lib/string-utils';

export interface AddPlayerModalProps {
    showAddPlayerModal: boolean;
    setShowAddPlayerModal: Dispatch<SetStateAction<boolean>>;
    newPlayerSearch: string;
    setNewPlayerSearch: Dispatch<SetStateAction<string>>;
    searchUnjoinedPlayers: (query?: string) => Promise<void>;
    searchingPlayers: boolean;
    unjoinedPlayers: Profile[];
    addingPlayer: string | null;
    addSubstitutePlayer: (userId: string) => Promise<void>;
}

export default function AddPlayerModal({ showAddPlayerModal, setShowAddPlayerModal, newPlayerSearch, setNewPlayerSearch, searchUnjoinedPlayers, searchingPlayers, unjoinedPlayers, addingPlayer, addSubstitutePlayer }: AddPlayerModalProps) {
    return (
        <>
            {showAddPlayerModal && typeof document !== 'undefined' && createPortal(
                            <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
                                <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-md" onClick={() => setShowAddPlayerModal(false)} />
                                <div className="card w-full max-w-sm relative z-10 animate-in fade-in zoom-in-95 duration-200" style={{ padding: '24px' }}>

                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(249,115,22,0.1)' }}>
                                            <Icon icon="solar:users-group-rounded-bold" width={20} style={{ color: 'var(--orange-500)' }} />
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-lg" style={{ color: 'var(--gray-900)' }}>เพิ่มผู้เล่น</h3>
                                            <p className="text-sm" style={{ color: 'var(--gray-500)' }}>เพิ่มผู้เล่นที่มีบัญชีในระบบลงในก๊วนนี้</p>
                                        </div>
                                    </div>

                                    <div className="form-group mb-4">
                                        <div className="relative">
                                            <Icon icon="solar:magnifer-linear" className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" width={16} />
                                            <input
                                                autoFocus
                                                type="text"
                                                className="form-input pl-9"
                                                placeholder="ค้นหาชื่อผู้เล่น..."
                                                value={newPlayerSearch}
                                                onChange={(e) => {
                                                    setNewPlayerSearch(e.target.value);
                                                    searchUnjoinedPlayers(e.target.value);
                                                }}
                                            />
                                        </div>
                                    </div>

                                    <div className="max-h-60 overflow-y-auto mb-4 border border-gray-100 rounded-xl">
                                        {searchingPlayers ? (
                                            <div className="flex justify-center p-4"><div className="spinner border-orange-500 border-t-transparent" /></div>
                                        ) : unjoinedPlayers.length > 0 ? (
                                            <div className="divide-y divide-gray-50">
                                                {unjoinedPlayers.map(p => (
                                                    <div key={p.id} className="flex items-center justify-between p-3 hover:bg-orange-50/50 transition-colors">
                                                        <div className="flex items-center gap-2 overflow-hidden">
                                                            <div className="w-8 h-8 rounded-full bg-gray-100 shrink-0 overflow-hidden flex items-center justify-center border border-gray-200">
                                                                {p.avatar_url ? (
                                                                    <img src={p.avatar_url} alt="" className="w-full h-full object-cover" />
                                                                ) : (
                                                                    <Icon icon="solar:user-bold" className="text-gray-400" width={16} />
                                                                )}
                                                            </div>
                                                            <div className="min-w-0">
                                                                <p className="text-sm font-medium text-gray-900 truncate">
                                                                    {truncateName(p.display_name, 20)}
                                                                </p>
                                                                {p.skill_level && (
                                                                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded text-gray-500 bg-gray-100 border border-gray-200">{p.skill_level}</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <button
                                                            disabled={addingPlayer === p.id}
                                                            onClick={() => addSubstitutePlayer(p.id)} // <--- เปลี่ยนเป็นชื่อนี้ครับ
                                                            className="btn btn-sm bg-orange-500 hover:bg-orange-600 border-none text-white whitespace-nowrap shrink-0 ml-2"
                                                        >
                                                            {addingPlayer === p.id ? <div className="spinner" style={{ width: 14, height: 14 }} /> : 'เพิ่ม'}
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="p-4 text-center text-sm text-gray-500 bg-gray-50">ไม่พบผู้เล่น</div>
                                        )}
                                    </div>

                                    <button onClick={() => setShowAddPlayerModal(false)} className="btn btn-secondary w-full">ปิด</button>
                                </div>
                            </div>,
                            document.body
                        )}
        </>
    );
}
