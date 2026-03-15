import React, { useRef, useEffect } from 'react';
import { useAgentContext } from '../../context/AgentContext';
import AgentStepCard from './AgentStepCard';
import { Bot, CheckCircle2, XCircle } from 'lucide-react';

const AgentStepList: React.FC = () => {
    const { steps, taskDescription, isRunning, doneResult } = useAgentContext();
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [steps, doneResult]);

    return (
        <div className="px-4 py-4 space-y-4">
            {/* User's task */}
            {taskDescription && (
                <div className="flex gap-3 items-start" style={{ animation: 'fadeInUp 0.3s ease-out' }}>
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-600 dark:to-slate-700 flex items-center justify-center shrink-0 mt-0.5">
                        <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">You</span>
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm leading-relaxed">{taskDescription}</p>
                    </div>
                </div>
            )}

            {/* Agent response header */}
            {steps.length > 0 && (
                <div className="flex items-center gap-2 mb-1" style={{ animation: 'fadeInUp 0.3s ease-out' }}>
                    <div className="w-5 h-5 rounded-md bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-sm">
                        <Bot className="w-3 h-3 text-white" />
                    </div>
                    <span className="text-[13px] font-medium text-[var(--chrome-text)]">Browser Agent</span>
                    {isRunning && (
                        <span className="text-[10px] text-[var(--accent)] animate-pulse font-medium">Working…</span>
                    )}
                </div>
            )}

            {/* Steps with timeline */}
            {steps.length > 0 && (
                <div className="agent-timeline">
                    {steps.map((step, index) => (
                        <div key={step.stepNumber} className="relative pb-4">
                            <div className={`agent-timeline-dot ${
                                doneResult && index === steps.length - 1
                                    ? doneResult.success ? 'agent-timeline-dot-done' : 'agent-timeline-dot-error'
                                    : ''
                            }`} />
                            <AgentStepCard step={step} />
                        </div>
                    ))}
                </div>
            )}

            {/* Running indicator */}
            {isRunning && steps.length > 0 && steps[steps.length - 1]?.status === 'thinking' && (
                <div className="flex items-center gap-2 px-2 py-1">
                    <div className="agent-thinking-dots">
                        <span /><span /><span />
                    </div>
                </div>
            )}

            {/* Done result */}
            {doneResult && (
                <div className={`agent-done-banner ${doneResult.success ? 'agent-done-success' : 'agent-done-fail'}`}>
                    <div className="flex items-center gap-2 mb-1">
                        {doneResult.success ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        ) : (
                            <XCircle className="w-4 h-4 text-[var(--error)]" />
                        )}
                        <span className="text-xs font-semibold">
                            {doneResult.success ? 'Task completed successfully' : 'Task could not be completed'}
                        </span>
                    </div>
                    {doneResult.result && (
                        <p className="text-xs opacity-70 pl-6 leading-relaxed">{doneResult.result}</p>
                    )}
                </div>
            )}

            <div ref={bottomRef} />
        </div>
    );
};

export default AgentStepList;
