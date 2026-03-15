import React, { useEffect, useState } from 'react';
import { useChatContext } from '../../context/ChatContext';
import { Bookmark } from 'lucide-react';

const ActiveTabSummary: React.FC = () => {
    const { sendMessage } = useChatContext();
    const [tabInfo, setTabInfo] = useState<{ id?: number; title?: string; favIconUrl?: string; url?: string }>({});

    const fetchActiveTab = () => {
        if (typeof chrome !== 'undefined' && chrome.tabs) {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0]) {
                    setTabInfo({
                        id: tabs[0].id,
                        title: tabs[0].title,
                        favIconUrl: tabs[0].favIconUrl || '',
                        url: tabs[0].url
                    });
                }
            });
        }
    };

    useEffect(() => {
        fetchActiveTab();

        const onActivated = () => fetchActiveTab();
        const onUpdated = (tabId: number, changeInfo: any, tab: chrome.tabs.Tab) => {
            if (tab.active) fetchActiveTab();
        };

        if (typeof chrome !== 'undefined' && chrome.tabs) {
            chrome.tabs.onActivated.addListener(onActivated);
            chrome.tabs.onUpdated.addListener(onUpdated);
        }

        return () => {
            if (typeof chrome !== 'undefined' && chrome.tabs) {
                chrome.tabs.onActivated.removeListener(onActivated);
                chrome.tabs.onUpdated.removeListener(onUpdated);
            }
        };
    }, []);

    const handleSummarize = () => {
        if (!tabInfo.id) return;

        if (tabInfo.url && (tabInfo.url.startsWith('chrome://') || tabInfo.url.startsWith('edge://'))) {
            sendMessage(`Please summarize this page: ${tabInfo.title || 'the current page'}\n(Note: extensions cannot read chrome:// pages directly.)`);
            return;
        }

        chrome.tabs.sendMessage(tabInfo.id, { action: 'getPageContent' }, (response) => {
            if (chrome.runtime.lastError || !response) {
                console.error(chrome.runtime.lastError);
                sendMessage(`Please summarize this page: ${tabInfo.title || 'the current page'}\n(Could not retrieve content. The page might need to be refreshed or does not allow access.)`);
                return;
            }
            if (response && response.content) {
                const prompt = `Start of Page Context:\nTitle: ${tabInfo.title}\nURL: ${tabInfo.url}\nFavicon: ${tabInfo.favIconUrl}\n\nContent:\n${response.content}\nEnd of Page Context\n\nPlease summarize the content of this page.`;
                sendMessage(prompt);
            }
        });
    };

    if (!tabInfo.title || (tabInfo.url?.startsWith('chrome://newtab'))) return null;

    return (
        <div className="glass-card flex items-center justify-between px-3 py-2 mb-3 max-w-full">
            <div className="flex items-center gap-2 overflow-hidden flex-1 mr-2">
                {tabInfo.favIconUrl ? (
                    <img src={tabInfo.favIconUrl} className="w-4 h-4 rounded-md flex-shrink-0" alt="" />
                ) : (
                    <div className="w-4 h-4 bg-[var(--accent-subtle)] rounded-md flex-shrink-0" />
                )}
                <span className="text-sm text-[var(--chrome-text)] truncate max-w-[200px]">
                    {tabInfo.title}
                </span>
            </div>

            <div className="flex items-center gap-3 flex-shrink-0">
                <button
                    onClick={handleSummarize}
                    className="text-sm font-medium text-[var(--accent)] hover:text-[var(--accent-hover)] transition-colors whitespace-nowrap cursor-pointer"
                >
                    Summarize
                </button>
                <div className="w-px h-4 bg-[var(--glass-border)]" />
                <button
                    className="text-[var(--chrome-text-secondary)] hover:text-[var(--accent)] transition-colors cursor-pointer"
                    title="Bookmark"
                >
                    <Bookmark className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
};

export default ActiveTabSummary;
