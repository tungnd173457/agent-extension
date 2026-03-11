import React, { useState, useRef, useEffect } from 'react';
import { useChatContext } from '../../context/ChatContext';
import { Scissors, Paperclip, History, Plus, BookOpen, X } from 'lucide-react';
import { CUSTOM_MODELS, WEBAPP_MODELS } from '../../../../shared/constants';
import ActiveTabSummary from '../shared/ActiveTabSummary';
import ToolbarDropdown from '../shared/ToolbarDropdown';

interface ChatInputProps {
    onToggleHistory: () => void;
}

const ChatInput: React.FC<ChatInputProps> = ({ onToggleHistory }) => {
    const { sendMessage, isStreaming, settings, setModel, setServiceProvider, startNewConversation, screenshotImage, setScreenshotImage } = useChatContext();
    const [text, setText] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const handleSend = () => {
        if ((!text.trim() && !screenshotImage) || isStreaming) return;
        sendMessage(text || 'What is in this image?');
        setText('');
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    // Auto-resize
    useEffect(() => {
        const ta = textareaRef.current;
        if (ta) {
            ta.style.height = 'auto';
            ta.style.height = Math.min(ta.scrollHeight, 150) + 'px';
        }
    }, [text]);

    const handleScreenshot = () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]?.id) {
                chrome.tabs.sendMessage(tabs[0].id, { action: 'startScreenshot' });
            }
        });
    };

    const currentModels = settings.serviceProvider === 'webapp' ? WEBAPP_MODELS : CUSTOM_MODELS;
    const currentModelLabel = currentModels.find(m => m.value === settings.chatModel)?.label || settings.chatModel;
    const currentProviderLabel = settings.serviceProvider === 'webapp' ? 'ChatGPT' : 'Custom';

    return (
        <div className="border-t border-[var(--chrome-border)] bg-[var(--chrome-bg)] p-3 shrink-0">
            {/* Active Tab Summary */}
            <ActiveTabSummary />

            {/* Toolbar above input */}
            <div className="flex items-center justify-between mb-3 px-1">
                <div className="flex items-center gap-2">
                    {/* Service Provider Dropdown */}
                    <ToolbarDropdown
                        value={settings.serviceProvider || 'custom'}
                        label={currentProviderLabel}
                        options={[
                            { value: 'webapp', label: 'ChatGPT' },
                            { value: 'custom', label: 'Custom' },
                        ]}
                        onChange={(provider) => {
                            setServiceProvider(provider as 'custom' | 'webapp');
                            const defaultModel = provider === 'webapp' ? WEBAPP_MODELS[0].value : CUSTOM_MODELS[0].value;
                            setModel(defaultModel);
                        }}
                    />

                    {/* Model Dropdown */}
                    <ToolbarDropdown
                        value={settings.chatModel}
                        label={currentModelLabel}
                        options={currentModels}
                        onChange={setModel}
                    />

                    <div className="h-4 w-[1px] bg-[var(--chrome-border)]" />

                    {/* Scissors (Screenshot) */}
                    <button
                        onClick={handleScreenshot}
                        className="opacity-60 hover:opacity-100 transition-opacity"
                        title="Screenshot selection"
                    >
                        <Scissors className="w-4 h-4" />
                    </button>

                    {/* Attachment (Visual only for now) */}
                    <button
                        className="opacity-60 hover:opacity-100 transition-opacity"
                        title="Attach file"
                    >
                        <Paperclip className="w-4 h-4" />
                    </button>

                    {/* Library/Prompts (Visual only for now) */}
                    <button
                        className="opacity-60 hover:opacity-100 transition-opacity"
                        title="Prompts"
                    >
                        <BookOpen className="w-4 h-4" />
                    </button>
                </div>

                <div className="flex items-center gap-3">
                    {/* History */}
                    <button
                        onClick={onToggleHistory}
                        className="opacity-60 hover:opacity-100 transition-opacity"
                        title="Chat History"
                    >
                        <History className="w-4 h-4" />
                    </button>

                    {/* New Chat */}
                    <button
                        onClick={startNewConversation}
                        className="w-6 h-6 rounded-lg bg-[var(--chrome-input-bg)] border border-[var(--chrome-border)] flex items-center justify-center text-[var(--chrome-text)] opacity-80 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5 transition-all"
                        title="New Chat"
                    >
                        <Plus className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Input Area */}
            <div className="relative group bg-[var(--chrome-input-bg)] rounded-2xl border border-[var(--chrome-border)] focus-within:border-[var(--chrome-text)]/20 transition-all">
                {/* Screenshot Preview */}
                {screenshotImage && (
                    <div className="px-3 pt-3">
                        <div className="relative inline-block group/img">
                            <img
                                src={screenshotImage}
                                alt="Screenshot"
                                className="max-h-[120px] max-w-full rounded-lg border border-[var(--chrome-border)] object-cover shadow-sm"
                            />
                            <button
                                onClick={() => setScreenshotImage(null)}
                                className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center shadow-md hover:bg-red-600 transition-colors opacity-0 group-hover/img:opacity-100"
                                title="Remove screenshot"
                            >
                                <X className="w-3 h-3" />
                            </button>
                        </div>
                    </div>
                )}

                <textarea
                    ref={textareaRef}
                    value={text}
                    onChange={e => setText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={screenshotImage ? "Ask about this screenshot..." : "Ask anything, @ models, / prompts"}
                    rows={1}
                    className="w-full bg-transparent text-[var(--chrome-text)] text-sm resize-none outline-none placeholder:opacity-30 px-4 pt-4 pb-2 min-h-[80px] max-h-[150px] pr-10"
                />

                {/* Visual Bottom Actions inside input */}
                <div className="flex justify-between items-center px-2 pb-2">
                    <div className="flex gap-2">
                        <button className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/5 dark:bg-white/5 border border-[var(--chrome-border)] text-[10px] opacity-60 hover:opacity-100 transition-opacity">
                            <span className="w-2 h-2 rounded-full border border-current opacity-60"></span>
                            Think
                        </button>
                        <button className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/5 dark:bg-white/5 border border-[var(--chrome-border)] text-[10px] opacity-60 hover:opacity-100 transition-opacity">
                            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
                            Deep Research
                        </button>
                    </div>

                    <button
                        onClick={handleSend}
                        disabled={(!text.trim() && !screenshotImage) || isStreaming}
                        className="w-8 h-8 rounded-full bg-[var(--chrome-text)] text-[var(--chrome-bg)] flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed hover:opacity-90 transition-all active:scale-95"
                    >
                        {isStreaming ? (
                            <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                        ) : (
                            <svg className="w-4 h-4 translate-x-px" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M3.478 2.405a.75.75 0 0 0-.926.94l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.405Z" />
                            </svg>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ChatInput;
