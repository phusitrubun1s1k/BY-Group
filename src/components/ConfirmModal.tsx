'use client';

import { Icon } from '@iconify/react';

interface ConfirmModalProps {
    isOpen: boolean;
    title: string;
    message: string;
    onConfirmAction: () => void;
    onCancelAction: () => void;
    confirmText?: string;
    cancelText?: string;
    type?: 'danger' | 'warning' | 'info';
}

export default function ConfirmModal({
    isOpen,
    title,
    message,
    onConfirmAction,
    onCancelAction,
    confirmText = 'ยืนยัน',
    cancelText = 'ยกเลิก',
    type = 'info'
}: ConfirmModalProps) {
    if (!isOpen) return null;

    const iconMap = {
        danger: { icon: 'solar:danger-triangle-bold-duotone', color: 'var(--danger)', bg: 'rgba(220, 38, 38, 0.08)' },
        warning: { icon: 'solar:danger-bold-duotone', color: 'var(--warning)', bg: 'rgba(217, 119, 6, 0.08)' },
        info: { icon: 'solar:info-circle-bold-duotone', color: 'var(--orange-500)', bg: 'rgba(249, 115, 22, 0.08)' }
    };

    const config = iconMap[type];

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            <div
                className="absolute inset-0 bg-gray-900/60 backdrop-blur-md animate-in"
                style={{ animationDuration: '0.2s' }}
                onClick={onCancelAction}
            />

            <div
                className="relative bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden animate-in"
                style={{ animationDuration: '0.3s', animationTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)' }}
            >
                <div className="p-8 text-center">
                    {/* Icon */}
                    <div
                        className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6"
                        style={{ background: config.bg }}
                    >
                        <Icon icon={config.icon} width={32} style={{ color: config.color }} />
                    </div>

                    <h3 className="text-xl font-bold text-gray-900 mb-2">{title}</h3>
                    <p className="text-sm text-gray-500 leading-relaxed">{message}</p>
                </div>

                <div className="flex border-t border-gray-100 p-4 gap-3 bg-gray-50/50">
                    <button
                        onClick={onCancelAction}
                        className="flex-1 px-4 py-3 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-100 transition-colors"
                    >
                        {cancelText}
                    </button>
                    <button
                        onClick={onConfirmAction}
                        className="flex-1 px-4 py-3 rounded-xl text-sm font-bold text-white transition-transform active:scale-95 shadow-lg shadow-orange-500/20"
                        style={{ background: type === 'danger' ? 'var(--danger)' : 'var(--orange-500)' }}
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
}
