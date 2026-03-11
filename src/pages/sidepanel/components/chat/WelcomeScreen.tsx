import React from 'react';
import { useChatContext } from '../../context/ChatContext';
import {
    Highlighter,
    MonitorSmartphone,
    BrainCircuit,
    Cpu
} from 'lucide-react';

const WelcomeScreen: React.FC = () => {
    const { sendMessage } = useChatContext();

    const topActions = [
        { icon: <MonitorSmartphone className="w-4 h-4" />, label: 'Full Screen Chat' },
        { icon: <BrainCircuit className="w-4 h-4" />, label: 'Deep Research' },
        { icon: <Highlighter className="w-4 h-4" />, label: 'My Highlights' },
        { icon: <Cpu className="w-4 h-4" />, label: 'AI Slides' },
    ];



    return (
        <div className="flex flex-col h-full bg-[var(--chrome-bg)] text-[var(--chrome-text)]">
            {/* Header Spacer for alignment */}
            <div className="flex-1 min-h-[10%]" />

            <div className="px-6 pb-10 max-w-2xl mx-auto w-full flex flex-col items-start">

                {/* Greeting */}
                <h1 className="text-4xl font-medium mb-2 opacity-90">Hi,</h1>
                <h2 className="text-2xl font-medium opacity-90 mb-8">How can I assist you today?</h2>

                {/* Top Actions (Mock functionality for now) */}
                <div className="flex flex-wrap gap-2 mb-10">
                    {topActions.map((action) => (
                        <button
                            key={action.label}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/5 dark:bg-white/5 border border-[var(--chrome-border)] hover:bg-black/10 dark:hover:bg-white/10 transition-colors text-xs font-medium opacity-80"
                        >
                            {action.icon}
                            {action.label}
                        </button>
                    ))}
                </div>

                {/* Quick Prompts */}
                {/* Content Removed as per request */}
                <div className="w-full"></div>
            </div>

            <div className="flex-1" />
        </div>
    );
};

export default WelcomeScreen;
