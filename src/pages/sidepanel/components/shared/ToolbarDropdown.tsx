import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

interface ToolbarDropdownProps {
    value: string;
    label: string;
    options: { value: string; label: string }[];
    onChange: (value: string) => void;
}

const ToolbarDropdown: React.FC<ToolbarDropdownProps> = ({ value, label, options, onChange }) => {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    return (
        <div ref={ref} className="relative">
            <button
                onClick={() => setOpen(o => !o)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[var(--chrome-input-bg)] text-[var(--chrome-text)] text-xs rounded-full border border-[var(--chrome-border)] hover:bg-black/5 dark:hover:bg-white/5 outline-none cursor-pointer transition-colors whitespace-nowrap"
            >
                <span>{label}</span>
                <ChevronDown className="w-3 h-3 opacity-50 shrink-0" />
            </button>

            {open && (
                <div className="absolute left-0 bottom-full mb-1.5 min-w-[120px] bg-[var(--chrome-bg)] border border-[var(--chrome-border)] rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.15)] z-50 py-1 overflow-hidden">
                    {options.map(opt => (
                        <button
                            key={opt.value}
                            onClick={() => { onChange(opt.value); setOpen(false); }}
                            className={`w-full text-left px-3 py-2 text-xs whitespace-nowrap transition-colors ${opt.value === value ? 'bg-[var(--chrome-text)]/10 text-[var(--chrome-text)]' : 'text-[var(--chrome-text)] hover:bg-[var(--chrome-text)]/5'}`}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

export default ToolbarDropdown;
