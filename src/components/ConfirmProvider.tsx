'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import ConfirmModal from './ConfirmModal';

interface ConfirmOptions {
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    type?: 'danger' | 'warning' | 'info';
}

interface ConfirmContextType {
    confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextType | undefined>(undefined);

export function ConfirmProvider({ children }: { children: ReactNode }) {
    const [confirmState, setConfirmState] = useState<{
        isOpen: boolean;
        options: ConfirmOptions;
        resolve: (value: boolean) => void;
    } | null>(null);

    const confirm = useCallback((options: ConfirmOptions) => {
        return new Promise<boolean>((resolve) => {
            setConfirmState({
                isOpen: true,
                options,
                resolve,
            });
        });
    }, []);

    const handleConfirm = useCallback(() => {
        if (confirmState) {
            confirmState.resolve(true);
            setConfirmState(null);
        }
    }, [confirmState]);

    const handleCancel = useCallback(() => {
        if (confirmState) {
            confirmState.resolve(false);
            setConfirmState(null);
        }
    }, [confirmState]);

    return (
        <ConfirmContext.Provider value={{ confirm }}>
            {children}
            {confirmState && (
                <ConfirmModal
                    isOpen={confirmState.isOpen}
                    {...confirmState.options}
                    onConfirmAction={handleConfirm}
                    onCancelAction={handleCancel}
                />
            )}
        </ConfirmContext.Provider>
    );
}

export function useConfirm() {
    const context = useContext(ConfirmContext);
    if (!context) {
        throw new Error('useConfirm must be used within a ConfirmProvider');
    }
    return context.confirm;
}
