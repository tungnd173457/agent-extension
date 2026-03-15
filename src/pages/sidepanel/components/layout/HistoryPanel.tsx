import React, { useState, useMemo } from 'react';
import { useChatContext } from '../../context/ChatContext';
import { X, Search, Trash2, MessageSquare, MonitorSmartphone } from 'lucide-react';
import { ChatConversation } from '../../../../services/chat/types';

interface HistoryPanelProps {
    onClose: () => void;
}

const HistoryPanel: React.FC<HistoryPanelProps> = ({ onClose }) => {
    const { conversations, currentConversation, loadConversation, deleteConversation } = useChatContext();
    const [search, setSearch] = useState('');
    const [activeTab, setActiveTab] = useState<'all' | 'starred'>('all');

    const filteredConversations = useMemo(() => {
        let filtered = conversations;

        if (search.trim()) {
            const q = search.toLowerCase();
            filtered = filtered.filter(c =>
                c.title.toLowerCase().includes(q) ||
                c.messages.some(m => m.content.toLowerCase().includes(q))
            );
        }

        if (activeTab === 'starred') {
            return [];
        }

        return filtered.sort((a, b) => b.updatedAt - a.updatedAt);
    }, [conversations, search, activeTab]);

    const groupedConversations = useMemo(() => {
        const groups: Record<string, ChatConversation[]> = {
            'Today': [],
            'Yesterday': [],
            'Previous 7 Days': [],
            'Older': []
        };

        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const yesterday = today - 86400000;
        const lastWeek = today - 86400000 * 7;

        filteredConversations.forEach(convo => {
            if (convo.updatedAt >= today) {
                groups['Today'].push(convo);
            } else if (convo.updatedAt >= yesterday) {
                groups['Yesterday'].push(convo);
            } else if (convo.updatedAt >= lastWeek) {
                groups['Previous 7 Days'].push(convo);
            } else {
                groups['Older'].push(convo);
            }
        });

        return Object.entries(groups).filter(([_, items]) => items.length > 0);
    }, [filteredConversations]);

    return (
        <div
            className="absolute inset-0 z-50 flex flex-col bg-[var(--chrome-bg)] text-[var(--chrome-text)]"
            style={{ animation: 'slideInLeft 0.2s ease-out' }}
        >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 shrink-0">
                <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold">Chat history</h2>
                    <span className="text-sm text-[var(--chrome-text-secondary)]">({conversations.length})</span>
                </div>
                <button
                    onClick={onClose}
                    className="p-1.5 rounded-lg text-[var(--chrome-text-secondary)] hover:text-[var(--chrome-text)] hover:bg-[var(--accent-subtle)] transition-all cursor-pointer"
                >
                    <X className="w-5 h-5" />
                </button>
            </div>

            {/* Sync Banner */}
            <div className="px-4 pb-4">
                <div className="glass-card p-3 flex items-center justify-between cursor-pointer">
                    <div className="flex items-center gap-2">
                        <MonitorSmartphone className="w-4 h-4 text-[var(--accent)]" />
                        <span className="text-xs font-medium">Sync chats across devices</span>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="px-4 flex gap-6 border-b border-[var(--glass-border)] mb-2">
                <button
                    onClick={() => setActiveTab('all')}
                    className={`pb-2.5 text-sm font-medium transition-colors relative cursor-pointer ${
                        activeTab === 'all' ? 'text-[var(--chrome-text)]' : 'text-[var(--chrome-text-secondary)] hover:text-[var(--chrome-text)]'
                    }`}
                >
                    All
                    {activeTab === 'all' && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--accent)] rounded-t-full" />
                    )}
                </button>
                <button
                    onClick={() => setActiveTab('starred')}
                    className={`pb-2.5 text-sm font-medium transition-colors relative cursor-pointer ${
                        activeTab === 'starred' ? 'text-[var(--chrome-text)]' : 'text-[var(--chrome-text-secondary)] hover:text-[var(--chrome-text)]'
                    }`}
                >
                    Starred
                    {activeTab === 'starred' && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--accent)] rounded-t-full" />
                    )}
                </button>
            </div>

            {/* Search */}
            <div className="px-4 py-2">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--chrome-text-secondary)]" />
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search"
                        className="w-full bg-[var(--chrome-input-bg)] text-[var(--chrome-text)] text-sm rounded-xl pl-9 pr-4 py-2.5 border border-[var(--glass-border)] focus:border-[var(--accent)]/40 focus:ring-2 focus:ring-[var(--accent)]/10 outline-none placeholder:text-[var(--chrome-text-secondary)] placeholder:opacity-50 transition-all"
                    />
                </div>
            </div>

            {/* Grouped List */}
            <div className="flex-1 overflow-y-auto px-2 py-2">
                {groupedConversations.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-40 text-[var(--chrome-text-secondary)] text-xs">
                        <MessageSquare className="w-8 h-8 mb-2 opacity-30" />
                        {search ? 'No results found' : 'No history yet'}
                    </div>
                ) : (
                    groupedConversations.map(([group, items]) => (
                        <div key={group} className="mb-6">
                            <div className="px-4 mb-2 text-xs font-semibold text-[var(--chrome-text-secondary)] uppercase tracking-wider">
                                {group}
                            </div>
                            <div className="space-y-0.5">
                                {items.map(convo => (
                                    <div
                                        key={convo.id}
                                        onClick={() => { loadConversation(convo.id); onClose(); }}
                                        className={`group relative flex items-start gap-3 px-4 py-3 rounded-xl cursor-pointer transition-all ${
                                            convo.id === currentConversation?.id
                                                ? 'bg-[var(--accent-subtle)] border border-[var(--accent)]/10'
                                                : 'hover:bg-[var(--accent-subtle)] border border-transparent'
                                        }`}
                                    >
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-medium truncate mb-0.5">
                                                {convo.title}
                                            </div>
                                            <div className="text-xs text-[var(--chrome-text-secondary)] truncate line-clamp-1">
                                                {convo.messages[convo.messages.length - 1]?.content || 'New conversation'}
                                            </div>
                                        </div>

                                        {/* Actions */}
                                        <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 flex items-center transition-opacity">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); deleteConversation(convo.id); }}
                                                className="p-1.5 rounded-lg text-[var(--chrome-text-secondary)] hover:text-[var(--error)] hover:bg-[var(--error)]/10 transition-all cursor-pointer"
                                                title="Delete"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-[var(--glass-border)] text-center">
                <button className="text-xs font-medium flex items-center justify-center gap-1 w-full py-2 hover:bg-[var(--accent-subtle)] rounded-xl transition-all text-[var(--chrome-text-secondary)] hover:text-[var(--accent)] cursor-pointer">
                    Upgrade Plan
                </button>
            </div>
        </div>
    );
};

export default HistoryPanel;
