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
            {/* Spacer */}
            <div className="flex-1 min-h-[10%]" />

            <div className="px-6 pb-10 max-w-2xl mx-auto w-full flex flex-col items-start">

                {/* Greeting */}
                <h1 className="text-4xl font-semibold mb-2">
                    <span className="gradient-text">Hi there</span>
                </h1>
                <h2 className="text-xl font-medium text-[var(--chrome-text-secondary)] mb-8">
                    How can I assist you today?
                </h2>

                {/* Action chips */}
                <div className="flex flex-wrap gap-2 mb-10">
                    {topActions.map((action) => (
                        <button
                            key={action.label}
                            className="toolbar-pill cursor-pointer"
                        >
                            <span className="text-[var(--accent)]">{action.icon}</span>
                            {action.label}
                        </button>
                    ))}
                </div>

                {/* Placeholder for quick prompts */}
                <div className="w-full"></div>
            </div>

            <div className="flex-1" />
        </div>
    );
};

export default WelcomeScreen;
