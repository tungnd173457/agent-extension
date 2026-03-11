import React from 'react';
import { useChatContext } from '../../context/ChatContext';
import { Sparkles } from 'lucide-react';

const ChatHeader: React.FC = () => {
    const { currentConversation } = useChatContext();

    return (
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] bg-[#0f0f10]/80 backdrop-blur-sm shrink-0">
            {/* Title / Branding */}
            <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shrink-0 shadow-lg shadow-violet-500/20">
                    <Sparkles className="w-4 h-4 text-white" />
                </div>
                <span className="text-sm font-medium text-white/90 truncate">
                    {currentConversation?.title || 'Any Tools'}
                </span>
            </div>
        </div>
    );
};

export default ChatHeader;
