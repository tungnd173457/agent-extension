import React, { useState } from 'react';
import { useAgentContext } from '../../context/AgentContext';
import AgentStepList from './AgentStepList';
import AgentWelcomeScreen from './AgentWelcomeScreen';
import AgentInput from './AgentInput';
import AgentHistoryPanel from './AgentHistoryPanel';
import ErrorBanner from '../shared/ErrorBanner';

const AgentLayout: React.FC = () => {
    const { steps, taskDescription, error, clearError } = useAgentContext();
    const [historyOpen, setHistoryOpen] = useState(false);

    const hasContent = steps.length > 0 || taskDescription;

    return (
        <div className="flex flex-col h-screen bg-[var(--chrome-bg)] text-[var(--chrome-text)] font-['Inter',system-ui,sans-serif] relative overflow-hidden">
            {/* Error */}
            {error && <ErrorBanner message={error} onClose={clearError} />}

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
                {hasContent ? <AgentStepList /> : <AgentWelcomeScreen />}
            </div>

            {/* Input */}
            <div className="flex-none bg-[var(--chrome-bg)]">
                <AgentInput onToggleHistory={() => setHistoryOpen(!historyOpen)} />
            </div>

            {/* History Overlay */}
            {historyOpen && (
                <AgentHistoryPanel onClose={() => setHistoryOpen(false)} />
            )}
        </div>
    );
};

export default AgentLayout;
