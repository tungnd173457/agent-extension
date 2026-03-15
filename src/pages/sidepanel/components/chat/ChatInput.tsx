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
        <div className="border-t border-[var(--glass-border)] bg-[var(--chrome-bg)] p-3 shrink-0">
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

                    <div className="h-4 w-[1px] bg-[var(--glass-border)]" />

                    {/* Scissors (Screenshot) */}
                    <button
                        onClick={handleScreenshot}
                        className="p-1.5 rounded-lg text-[var(--chrome-text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--accent-subtle)] transition-all cursor-pointer"
                        title="Screenshot selection"
                    >
                        <Scissors className="w-4 h-4" />
                    </button>

                    {/* Attachment */}
                    <button
                        className="p-1.5 rounded-lg text-[var(--chrome-text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--accent-subtle)] transition-all cursor-pointer"
                        title="Attach file"
                    >
                        <Paperclip className="w-4 h-4" />
                    </button>

                    {/* Prompts */}
                    <button
                        className="p-1.5 rounded-lg text-[var(--chrome-text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--accent-subtle)] transition-all cursor-pointer"
                        title="Prompts"
                    >
                        <BookOpen className="w-4 h-4" />
                    </button>
                </div>

                <div className="flex items-center gap-2">
                    {/* History */}
                    <button
                        onClick={onToggleHistory}
                        className="p-1.5 rounded-lg text-[var(--chrome-text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--accent-subtle)] transition-all cursor-pointer"
                        title="Chat History"
                    >
                        <History className="w-4 h-4" />
                    </button>

                    {/* New Chat */}
                    <button
                        onClick={startNewConversation}
                        className="w-7 h-7 rounded-lg bg-[var(--accent-subtle)] border border-[var(--glass-border)] flex items-center justify-center text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white hover:border-transparent transition-all cursor-pointer"
                        title="New Chat"
                    >
                        <Plus className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Input Area */}
            <div className="input-glass relative group">
                {/* Screenshot Preview */}
                {screenshotImage && (
                    <div className="px-3 pt-3">
                        <div className="relative inline-block group/img">
                            <img
                                src={screenshotImage}
                                alt="Screenshot"
                                className="max-h-[120px] max-w-full rounded-xl border border-[var(--glass-border)] object-cover shadow-sm"
                            />
                            <button
                                onClick={() => setScreenshotImage(null)}
                                className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-[var(--error)] text-white flex items-center justify-center shadow-md hover:brightness-110 transition-all opacity-0 group-hover/img:opacity-100 cursor-pointer"
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
                    className="w-full bg-transparent text-[var(--chrome-text)] text-sm resize-none outline-none placeholder:text-[var(--chrome-text-secondary)] placeholder:opacity-40 px-4 pt-4 pb-2 min-h-[80px] max-h-[150px] pr-12"
                />

                {/* Bottom Actions inside input */}
                <div className="flex justify-between items-center px-3 pb-3">
                    <div className="flex gap-2">
                        <button className="toolbar-pill !py-1 !px-3 !text-[10px] cursor-pointer">
                            <span className="w-2 h-2 rounded-full border border-current opacity-60"></span>
                            Think
                        </button>
                        <button className="toolbar-pill !py-1 !px-3 !text-[10px] cursor-pointer">
                            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
                            Deep Research
                        </button>
                    </div>

                    <button
                        onClick={handleSend}
                        disabled={(!text.trim() && !screenshotImage) || isStreaming}
                        className="send-btn w-8 h-8"
                    >
                        {isStreaming ? (
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
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
