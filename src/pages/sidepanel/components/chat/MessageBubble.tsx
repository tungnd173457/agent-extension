import React, { useState } from 'react';
import { Globe } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChatMessage } from '../../../../services/chat/types';
import { CUSTOM_MODELS, WEBAPP_MODELS } from '../../../../shared/constants';

interface MessageBubbleProps {
    message: ChatMessage;
}

function formatTime(ts: number): string {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function getModelIcon(model?: string): string | null {
    if (!model) return null;
    if (model.startsWith('gpt-4.1')) return 'icons/gpt-4.1.svg';
    if (model.startsWith('gpt-4o')) return 'icons/gpt-4o.svg';
    if (model.startsWith('gpt-5')) return 'icons/gpt-5.svg';
    if (model.startsWith('auto')) return 'icons/chatgpt.svg';
    return null;
}

function getModelDisplayName(model?: string): string {
    if (!model) return 'AI';
    const allModels = [...CUSTOM_MODELS, ...WEBAPP_MODELS];
    const exact = allModels.find(m => m.value === model);
    if (exact) return exact.label;
    const sorted = [...allModels].sort((a, b) => b.value.length - a.value.length);
    const prefix = sorted.find(m => model.startsWith(m.value));
    if (prefix) return prefix.label;
    return model;
}

// ─── Markdown custom components ───────────────────────────────────────────────

const MarkdownComponents: Record<string, React.FC<any>> = {
    code({ inline, className, children, ...props }: any) {
        const match = /language-(\w+)/.exec(className || '');
        const lang = match ? match[1] : '';

        if (!inline && (lang || String(children).includes('\n'))) {
            return (
                <div className="code-block-wrapper">
                    {lang && <div className="code-lang">{lang}</div>}
                    <pre>
                        <code className={className} {...props}>
                            {children}
                        </code>
                    </pre>
                </div>
            );
        }

        return (
            <code className="inline-code" {...props}>
                {children}
            </code>
        );
    },

    a({ children, href, ...props }: any) {
        return (
            <a href={href} target="_blank" rel="noreferrer" {...props}>
                {children}
            </a>
        );
    },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

const ImagePreview: React.FC<{ src: string }> = ({ src }) => {
    const [expanded, setExpanded] = useState(false);

    return (
        <>
            <img
                src={src}
                alt="Screenshot"
                className="max-w-full max-h-[200px] rounded-xl border border-[var(--glass-border)] object-cover cursor-pointer hover:opacity-90 transition-opacity shadow-sm mb-2"
                onClick={() => setExpanded(true)}
            />
            {expanded && (
                <div
                    className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center cursor-pointer backdrop-blur-md"
                    onClick={() => setExpanded(false)}
                >
                    <img
                        src={src}
                        alt="Screenshot expanded"
                        className="max-w-[90%] max-h-[90%] rounded-2xl shadow-2xl object-contain"
                    />
                </div>
            )}
        </>
    );
};

const ContextBox: React.FC<{ text: string }> = ({ text }) => {
    const [expanded, setExpanded] = useState(false);
    return (
        <div
            className="mb-2 max-w-full glass-card px-3 py-2 text-[13px] text-[var(--chrome-text-secondary)] cursor-pointer hover:border-[var(--accent)]/20 transition-all"
            onClick={() => setExpanded(!expanded)}
            title="Click to expand/collapse"
        >
            <div className={`whitespace-pre-wrap break-words ${expanded ? '' : 'line-clamp-1'}`}>
                {text}
            </div>
        </div>
    );
};

const PageContextBox: React.FC<{ title: string; url: string; favicon: string; content: string }> = ({ title, url, favicon, content }) => {
    const [expanded, setExpanded] = useState(false);

    let hostname = url;
    try {
        hostname = new URL(url).hostname;
    } catch {
        // ignore
    }

    return (
        <div className="mb-2 w-full max-w-[250px] glass-card p-3 text-[13px] text-[var(--chrome-text-secondary)] flex flex-col gap-2 cursor-pointer transition-all"
            onClick={() => setExpanded(!expanded)}
        >
            <div className="flex items-center gap-2">
                {favicon ? (
                    <img src={favicon} className="w-5 h-5 rounded-md flex-shrink-0 object-contain bg-white/50" alt="" />
                ) : (
                    <Globe className="w-5 h-5 text-[var(--accent)]" />
                )}
                <div className="flex flex-col overflow-hidden w-full">
                    <span className="font-medium text-[var(--chrome-text)] truncate w-full" title={title}>{title}</span>
                    <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-[var(--chrome-text-secondary)] hover:text-[var(--accent)] truncate w-full transition-colors flex items-center justify-start"
                        onClick={(e) => e.stopPropagation()}
                        title={url}
                    >
                        {hostname}
                    </a>
                </div>
            </div>
            {expanded && (
                <div className="mt-2 pt-2 border-t border-[var(--glass-border)] text-[12px] opacity-80 whitespace-pre-wrap break-words max-h-[200px] overflow-y-auto">
                    <div className="line-clamp-[10]">{content}</div>
                </div>
            )}
        </div>
    );
};

// ─── Main component ───────────────────────────────────────────────────────────

const MessageBubble: React.FC<MessageBubbleProps> = ({ message }) => {
    const isUser = message.role === 'user';

    let displayContent = message.content;
    let contextText = null;
    let pageContext = null;

    if (isUser && message.content) {
        const textContextMatch = message.content.match(/^Start of Context:\n"([\s\S]*?)"\nEnd of Context\n\n([\s\S]*)$/);
        const pageContextMatch = message.content.match(/^Start of Page Context:\nTitle: (.*)\nURL: (.*)\nFavicon: (.*)\n\nContent:\n([\s\S]*?)\nEnd of Page Context\n\n([\s\S]*)$/);

        if (textContextMatch) {
            contextText = textContextMatch[1];
            displayContent = textContextMatch[2];
        } else if (pageContextMatch) {
            pageContext = {
                title: pageContextMatch[1],
                url: pageContextMatch[2],
                favicon: pageContextMatch[3],
                content: pageContextMatch[4]
            };
            displayContent = pageContextMatch[5];
        }
    }

    if (isUser) {
        return (
            <div className="flex justify-end mb-4" style={{ animation: 'fadeInUp 0.3s ease-out' }}>
                <div className="max-w-[85%] flex flex-col items-end text-left w-full">
                    {contextText && <ContextBox text={contextText} />}
                    {pageContext && <PageContextBox {...pageContext} />}
                    <div className="user-bubble rounded-2xl px-4 py-2.5 text-[14px] leading-relaxed self-end">
                        {message.imageUrl && (
                            <ImagePreview src={message.imageUrl} />
                        )}
                        {displayContent && (
                            <div className="msg-content break-words">
                                {displayContent}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // AI message — full width, left-aligned
    const modelName = getModelDisplayName(message.model);
    const modelIconPath = getModelIcon(message.model);

    return (
        <div className="mb-4 group ai-message">
            {/* Header row: icon + model name */}
            <div className="flex items-center gap-2 mb-3">
                <div className="shrink-0">
                    {modelIconPath ? (
                        <img
                            src={chrome.runtime.getURL(modelIconPath)}
                            alt={modelName}
                            className="w-[20px] h-[20px] rounded-full object-contain ring-1 ring-[var(--glass-border)]"
                        />
                    ) : (
                        <div className="w-[20px] h-[20px] rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center shadow-sm">
                            <span className="text-[8px] text-white font-semibold">AI</span>
                        </div>
                    )}
                </div>
                <span className="text-[13px] font-medium text-[var(--chrome-text)]">{modelName}</span>
                {!message.isStreaming && (
                    <span className="text-[10px] text-[var(--chrome-text-secondary)] mt-0.5">{formatTime(message.timestamp)}</span>
                )}
                {message.isStreaming && (
                    <span className="text-[10px] text-[var(--accent)] animate-pulse mt-0.5 font-medium">Đang trả lời…</span>
                )}
            </div>

            {/* Content */}
            <div className="msg-content text-[var(--chrome-text)] text-[14px] leading-[1.7]">
                <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={MarkdownComponents}
                >
                    {message.content}
                </ReactMarkdown>
            </div>
        </div>
    );
};

export default MessageBubble;
