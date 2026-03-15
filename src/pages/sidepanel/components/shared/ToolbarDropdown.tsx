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
                className="toolbar-pill cursor-pointer"
            >
                <span>{label}</span>
                <ChevronDown className={`w-3 h-3 opacity-50 shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && (
                <div className="absolute left-0 bottom-full mb-1.5 min-w-[140px] dropdown-glass z-50 py-1" style={{ animation: 'fadeInUp 0.15s ease-out' }}>
                    {options.map(opt => (
                        <button
                            key={opt.value}
                            onClick={() => { onChange(opt.value); setOpen(false); }}
                            className={`w-full text-left px-3 py-2 text-xs whitespace-nowrap transition-all cursor-pointer ${
                                opt.value === value
                                    ? 'bg-[var(--accent-subtle)] text-[var(--accent)] font-medium'
                                    : 'text-[var(--chrome-text)] hover:bg-[var(--accent-subtle)] hover:text-[var(--chrome-text)]'
                            }`}
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
