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

/**
 * Map a model value (e.g. "gpt-4.1-mini") to the icon filename in /icons/.
 */
function getModelIcon(model?: string): string | null {
    if (!model) return null;
    if (model.startsWith('gpt-4.1')) return 'icons/gpt-4.1.svg';
    if (model.startsWith('gpt-4o')) return 'icons/gpt-4o.svg';
    if (model.startsWith('gpt-5')) return 'icons/gpt-5.svg';
    if (model.startsWith('auto')) return 'icons/chatgpt.svg';
    return null;
}

/**
 * Map a model value to a human-readable display name using the constants.
 * Uses prefix matching so API-returned names like "gpt-4o-mini-2024-07-18"
 * correctly resolve to "GPT-4o Mini".
 */
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
    // Code blocks & inline code
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

    // Make links open in new tab
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
                className="max-w-full max-h-[200px] rounded-lg border border-white/10 object-cover cursor-pointer hover:opacity-90 transition-opacity shadow-sm mb-2"
                onClick={() => setExpanded(true)}
            />
            {expanded && (
                <div
                    className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center cursor-pointer backdrop-blur-sm"
                    onClick={() => setExpanded(false)}
                >
                    <img
                        src={src}
                        alt="Screenshot expanded"
                        className="max-w-[90%] max-h-[90%] rounded-xl shadow-2xl object-contain"
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
            className="mb-2 max-w-full rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/10 px-3 py-2 text-[13px] text-gray-700 dark:text-gray-300 cursor-pointer hover:bg-black/10 dark:hover:bg-white/20 transition-all dropdown-shadow"
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
        <div className="mb-2 w-full max-w-[250px] rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/10 p-3 text-[13px] text-gray-700 dark:text-gray-300 dropdown-shadow flex flex-col gap-2 cursor-pointer hover:bg-black/10 dark:hover:bg-white/20 transition-all"
            onClick={() => setExpanded(!expanded)}
        >
            <div className="flex items-center gap-2">
                {favicon ? (
                    <img src={favicon} className="w-5 h-5 rounded-sm flex-shrink-0 object-contain bg-white/50" alt="" />
                ) : (
                    <Globe className="w-5 h-5 text-[#8b5cf6]" />
                )}
                <div className="flex flex-col overflow-hidden w-full">
                    <span className="font-medium text-[var(--chrome-text)] truncate w-full" title={title}>{title}</span>
                    <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] opacity-60 hover:text-[#8b5cf6] hover:opacity-100 truncate w-full transition-colors flex items-center justify-start"
                        onClick={(e) => e.stopPropagation()}
                        title={url}
                    >
                        {hostname}
                    </a>
                </div>
            </div>
            {expanded && (
                <div className="mt-2 pt-2 border-t border-black/10 dark:border-white/10 text-[12px] opacity-80 whitespace-pre-wrap break-words max-h-[200px] overflow-y-auto custom-scrollbar">
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
            <div className="flex justify-end mb-4">
                <div className="max-w-[85%] flex flex-col items-end text-left w-full">
                    {contextText && <ContextBox text={contextText} />}
                    {pageContext && <PageContextBox {...pageContext} />}
                    <div className="bg-[#f0f0f0] dark:bg-[#2f2f2f] text-black dark:text-white rounded-2xl px-4 py-2.5 text-[14px] leading-relaxed shadow-sm self-end">
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

    // AI message — full width, left-aligned, content flush with icon
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
                            className="w-[18px] h-[18px] rounded-full object-contain"
                        />
                    ) : (
                        <div className="w-[18px] h-[18px] rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center">
                            <span className="text-[8px] text-white font-medium">AI</span>
                        </div>
                    )}
                </div>
                <span className="text-[14px] font-light text-[var(--chrome-text)]">{modelName}</span>
                {!message.isStreaming && (
                    <span className="text-[10px] opacity-30 mt-0.5">{formatTime(message.timestamp)}</span>
                )}
                {message.isStreaming && (
                    <span className="text-[10px] opacity-40 animate-pulse mt-0.5">Đang trả lời…</span>
                )}
            </div>

            {/* Content: flush left, rendered with react-markdown */}
            <div className="msg-content text-[var(--chrome-text)] text-[14px] leading-[1.6]">
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
