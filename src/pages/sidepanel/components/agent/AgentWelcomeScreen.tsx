import React from 'react';
import { useAgentContext } from '../../context/AgentContext';
import { Bot, Globe, ShoppingCart, Search, FileText } from 'lucide-react';

const AgentWelcomeScreen: React.FC = () => {
    const { startAgent } = useAgentContext();

    const suggestions = [
        { icon: <Globe className="w-3.5 h-3.5" />, text: 'Find the best price for AirPods Pro' },
        { icon: <ShoppingCart className="w-3.5 h-3.5" />, text: 'Add items to my cart on Amazon' },
        { icon: <Search className="w-3.5 h-3.5" />, text: 'Search for flights to Tokyo' },
        { icon: <FileText className="w-3.5 h-3.5" />, text: 'Fill out this form for me' },
    ];

    return (
        <div className="flex flex-col h-full bg-[var(--chrome-bg)] text-[var(--chrome-text)]">
            <div className="flex-1 min-h-[10%]" />

            <div className="px-6 pb-10 max-w-2xl mx-auto w-full flex flex-col items-start">
                {/* Agent branding */}
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/25">
                        <Bot className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-semibold opacity-90">Browser Agent</h1>
                        <p className="text-xs text-[var(--chrome-text-secondary)] mt-0.5">Automate any browser task</p>
                    </div>
                </div>

                <p className="text-sm text-[var(--chrome-text-secondary)] mb-8 leading-relaxed">
                    Tell me what you'd like to do — I'll navigate, click, type, and interact with web pages to complete your task.
                </p>

                {/* Suggestion chips */}
                <div className="flex flex-col gap-2 w-full">
                    {suggestions.map((s, i) => (
                        <button
                            key={i}
                            onClick={() => startAgent(s.text)}
                            className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-black/[0.03] dark:bg-white/[0.04] border border-[var(--chrome-border)] hover:bg-black/[0.06] dark:hover:bg-white/[0.08] hover:border-violet-300 dark:hover:border-violet-500/30 transition-all text-xs text-left group"
                        >
                            <span className="text-[var(--chrome-text-secondary)] group-hover:text-violet-500 transition-colors">
                                {s.icon}
                            </span>
                            <span className="opacity-70 group-hover:opacity-100 transition-opacity">{s.text}</span>
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex-1" />
        </div>
    );
};

export default AgentWelcomeScreen;
