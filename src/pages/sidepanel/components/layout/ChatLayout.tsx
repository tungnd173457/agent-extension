import React, { useState } from 'react';
import { useChatContext } from '../../context/ChatContext';

import MessageList from '../chat/MessageList';
import ChatInput from '../chat/ChatInput';
import HistoryPanel from './HistoryPanel';
import WelcomeScreen from '../chat/WelcomeScreen';
import ErrorBanner from '../shared/ErrorBanner';
import SelectionContext from '../shared/SelectionContext';

const ChatLayout: React.FC = () => {
    const { messages, error, clearError } = useChatContext();
    const [historyOpen, setHistoryOpen] = useState(false);

    return (
        <div className="flex flex-col h-screen bg-[var(--chrome-bg)] text-[var(--chrome-text)] font-['Inter',system-ui,sans-serif] relative overflow-hidden">
            {/* Error */}
            {error && <ErrorBanner message={error} onClose={clearError} />}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto">
                {messages.length === 0 ? <WelcomeScreen /> : <MessageList />}
            </div>

            {/* Input */}
            {/* Input Area */}
            <div className="flex-none bg-[var(--chrome-bg)]">
                <SelectionContext />
                <ChatInput onToggleHistory={() => setHistoryOpen(!historyOpen)} />
            </div>

            {/* History Overlay */}
            {historyOpen && (
                <HistoryPanel onClose={() => setHistoryOpen(false)} />
            )}
        </div>
    );
};

export default ChatLayout;
