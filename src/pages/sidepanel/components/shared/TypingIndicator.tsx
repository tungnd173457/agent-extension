import React from 'react';

const TypingIndicator: React.FC = () => {
    return (
        <div className="mb-4" style={{ animation: 'fadeInUp 0.3s ease-out' }}>
            <div className="flex items-center gap-2 mb-1.5">
                <div className="w-5 h-5 rounded-md bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center shadow-sm">
                    <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M12 2L2 7l10 5 10-5-10-5z" />
                        <path d="M2 17l10 5 10-5" />
                        <path d="M2 12l10 5 10-5" />
                    </svg>
                </div>
                <span className="text-[11px] text-[var(--chrome-text-secondary)] font-medium">AI</span>
            </div>
            <div className="pl-7 flex items-center gap-1.5 h-6">
                <div className="typing-dot w-2 h-2 rounded-full bg-[var(--accent)]" />
                <div className="typing-dot w-2 h-2 rounded-full bg-[var(--accent)]" />
                <div className="typing-dot w-2 h-2 rounded-full bg-[var(--accent)]" />
            </div>
        </div>
    );
};

export default TypingIndicator;
