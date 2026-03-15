import React from 'react';
import { X, AlertCircle } from 'lucide-react';

interface ErrorBannerProps {
    message: string;
    onClose: () => void;
}

const ErrorBanner: React.FC<ErrorBannerProps> = ({ message, onClose }) => {
    return (
        <div
            className="mx-3 mt-2 flex items-center gap-2 bg-[var(--error)]/8 border border-[var(--error)]/15 text-[var(--error)] text-xs rounded-xl px-3 py-2.5 shrink-0 backdrop-blur-sm"
            style={{ animation: 'fadeInUp 0.2s ease-out' }}
        >
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="flex-1 leading-tight">{message}</span>
            <button
                onClick={onClose}
                className="p-0.5 rounded-md hover:bg-[var(--error)]/10 transition-colors shrink-0 cursor-pointer"
            >
                <X className="w-3.5 h-3.5" />
            </button>
        </div>
    );
};

export default ErrorBanner;
