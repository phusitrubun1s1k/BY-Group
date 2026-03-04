'use client';

import { useState, useRef, useEffect } from 'react';
import { Icon } from '@iconify/react';

export interface SelectOption {
    value: string;
    label: string;
    icon?: string;
    description?: string;
}

interface CustomSelectProps {
    value: string;
    onChangeAction: (value: string) => void;
    options: SelectOption[];
    label?: string;
    placeholder?: string;
    className?: string;
    icon?: string;
}

export default function CustomSelect({
    value,
    onChangeAction,
    options,
    label,
    placeholder = 'เลือกตัวเลือก...',
    className = '',
    icon
}: CustomSelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const selectedOption = options.find(opt => opt.value === value);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div className={`space-y-1.5 ${className}`} ref={containerRef}>
            {label && (
                <label className="text-[11px] font-black uppercase tracking-widest text-gray-400 ml-1 block">
                    {label}
                </label>
            )}
            <div className="relative">
                <button
                    type="button"
                    onClick={() => setIsOpen(!isOpen)}
                    className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-gray-200 bg-white text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all text-left group"
                >
                    <div className="flex items-center gap-2.5 truncate">
                        {icon && <Icon icon={icon} className="text-gray-400 shrink-0 group-hover:text-blue-500 transition-colors" width={18} />}
                        {selectedOption?.icon && <Icon icon={selectedOption.icon} className="text-blue-500 shrink-0" width={18} />}
                        <span className={selectedOption ? 'text-gray-900' : 'text-gray-400 font-medium'}>
                            {selectedOption ? selectedOption.label : placeholder}
                        </span>
                    </div>
                    <Icon
                        icon="solar:alt-arrow-down-linear"
                        className={`text-gray-400 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
                        width={18}
                    />
                </button>

                {isOpen && (
                    <div className="absolute z-[120] w-full mt-2 bg-white rounded-2xl shadow-2xl border border-gray-100 py-2 animate-in fade-in zoom-in-95 duration-200 origin-top overflow-hidden">
                        <div className="max-h-60 overflow-y-auto scrollbar-hide">
                            {options.map((option) => (
                                <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => {
                                        onChangeAction(option.value);
                                        setIsOpen(false);
                                    }}
                                    className={`w-full flex items-center gap-3 px-4 py-2.5 transition-all text-left ${value === option.value
                                        ? 'bg-blue-50 text-blue-600'
                                        : 'hover:bg-gray-50 text-gray-700'
                                        }`}
                                >
                                    {option.icon && (
                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${value === option.value ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-400'
                                            }`}>
                                            <Icon icon={option.icon} width={18} />
                                        </div>
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-black truncate">{option.label}</p>
                                        {option.description && (
                                            <p className="text-[10px] font-bold opacity-50 truncate leading-tight">{option.description}</p>
                                        )}
                                    </div>
                                    {value === option.value && (
                                        <Icon icon="solar:check-circle-bold" className="text-blue-500 shrink-0" width={18} />
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
