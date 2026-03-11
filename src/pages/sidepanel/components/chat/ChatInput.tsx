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
        <div className="bg-[var(--chrome-bg)] shrink-0" style={{ padding: '6px 10px 10px 10px' }}>
            {/* Active Tab Summary */}
            <ActiveTabSummary />

            {/* Toolbar above input */}
            <div className="flex items-center justify-between mb-3 px-1">
                <div className="flex items-center gap-2">
                    {/* Scissors (Screenshot) */}
                    <button
                        onClick={handleScreenshot}
                        className="w-[26px] h-[26px] flex items-center justify-center rounded-[6px] border border-[var(--color-border)] text-[var(--color-text-secondary)] bg-transparent cursor-pointer hover:bg-black/5 transition-colors"
                        title="Screenshot selection"
                    >
                        <Scissors className="w-4 h-4" />
                    </button>

                    {/* Attachment (Visual only for now) */}
                    <button
                        className="w-[26px] h-[26px] flex items-center justify-center rounded-[6px] border border-[var(--color-border)] text-[var(--color-text-secondary)] bg-transparent cursor-pointer hover:bg-black/5 transition-colors"
                        title="Attach file"
                    >
                        <Paperclip className="w-4 h-4" />
                    </button>

                    {/* Library/Prompts (Visual only for now) */}
                    <button
                        className="w-[26px] h-[26px] flex items-center justify-center rounded-[6px] border border-[var(--color-border)] text-[var(--color-text-secondary)] bg-transparent cursor-pointer hover:bg-black/5 transition-colors"
                        title="Prompts"
                    >
                        <BookOpen className="w-4 h-4" />
                    </button>
                </div>

                <div className="flex items-center gap-3">
                    {/* History */}
                    <button
                        onClick={onToggleHistory}
                        className="w-[26px] h-[26px] flex items-center justify-center rounded-[6px] border border-[var(--color-border)] text-[var(--color-text-secondary)] bg-transparent cursor-pointer hover:bg-black/5 transition-colors"
                        title="Chat History"
                    >
                        <History className="w-4 h-4" />
                    </button>

                    {/* New Chat */}
                    <button
                        onClick={startNewConversation}
                        className="w-[26px] h-[26px] flex items-center justify-center rounded-[6px] border border-[var(--color-border)] text-[var(--color-text-secondary)] bg-transparent cursor-pointer hover:bg-black/5 transition-colors"
                        title="New Chat"
                    >
                        <Plus className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Chatbox */}
            <div style={{
                border: '1px solid var(--color-border)',
                borderRadius: '10px',
                padding: '9px 10px 7px 11px',
                display: 'flex',
                flexDirection: 'column',
            }}>
                {/* Screenshot preview */}
                {screenshotImage && (
                    <div style={{ borderRadius: '6px', border: '1px solid var(--color-border)', marginBottom: '6px', overflow: 'hidden' }}>
                        <div className="relative inline-block group/img">
                            <img
                                src={screenshotImage}
                                alt="Screenshot"
                                className="max-h-[120px] max-w-full object-cover"
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

                {/* Textarea */}
                <textarea
                    className="text-[11px] resize-none outline-none w-full bg-transparent"
                    style={{
                        color: 'var(--color-text)',
                        minHeight: '38px',
                        marginBottom: '7px',
                    }}
                    placeholder="Ask anything, @ models, / prompts"
                    value={text}
                    onChange={e => setText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    rows={1}
                    ref={textareaRef}
                />

                {/* Bottom row */}
                <div className="flex items-center gap-[5px]">
                    {/* Service selector — moved from toolbar row */}
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

                    {/* Model selector — moved from toolbar row, add gradient dot */}
                    <div className="flex items-center gap-1">
                        <div style={{
                            width: '10px', height: '10px',
                            borderRadius: '50%',
                            background: 'linear-gradient(135deg, #7c3aed, #a78bfa)',
                            flexShrink: 0,
                        }} />
                        <ToolbarDropdown
                            value={settings.chatModel}
                            label={currentModelLabel}
                            options={currentModels}
                            onChange={setModel}
                        />
                    </div>

                    {/* Send button */}
                    <button
                        style={{
                            marginLeft: 'auto',
                            width: '26px', height: '26px',
                            borderRadius: '50%',
                            border: 'none',
                            cursor: (!text.trim() && !screenshotImage) ? 'default' : 'pointer',
                            background: (!text.trim() && !screenshotImage)
                                ? 'var(--color-send-inactive)'
                                : 'var(--color-primary)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0,
                        }}
                        onClick={handleSend}
                        disabled={!text.trim() && !screenshotImage && !isStreaming}
                    >
                        {isStreaming ? (
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <svg className="w-4 h-4 translate-x-px" viewBox="0 0 24 24" fill="white">
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
