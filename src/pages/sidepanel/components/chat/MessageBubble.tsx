import React, { useState } from 'react';
import { Globe } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChatMessage } from '../../../../services/chat/types';

interface MessageBubbleProps {
    message: ChatMessage;
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
                className="max-w-full max-h-[200px] rounded-[6px] border border-[var(--color-border)] object-cover cursor-pointer hover:opacity-90 transition-opacity mb-2"
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
            className="mb-2 max-w-full rounded-[6px] border border-black/10 bg-black/5 px-3 py-2 text-[12px] text-[var(--color-text-secondary)] cursor-pointer hover:bg-black/10 transition-all"
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
    try { hostname = new URL(url).hostname; } catch { /* ignore */ }

    return (
        <div
            className="mb-2 w-full max-w-[250px] rounded-[6px] border border-black/10 bg-black/5 p-3 text-[12px] text-[var(--color-text-secondary)] flex flex-col gap-2 cursor-pointer hover:bg-black/10 transition-all"
            onClick={() => setExpanded(!expanded)}
        >
            <div className="flex items-center gap-2">
                {favicon ? (
                    <img src={favicon} className="w-5 h-5 rounded-sm flex-shrink-0 object-contain" alt="" />
                ) : (
                    <Globe className="w-5 h-5 text-[var(--color-primary)]" />
                )}
                <div className="flex flex-col overflow-hidden w-full">
                    <span className="font-medium text-[var(--color-text)] truncate w-full" title={title}>{title}</span>
                    <a
                        href={url} target="_blank" rel="noreferrer"
                        className="text-[11px] opacity-60 hover:text-[var(--color-primary)] hover:opacity-100 truncate w-full transition-colors"
                        onClick={(e) => e.stopPropagation()} title={url}
                    >
                        {hostname}
                    </a>
                </div>
            </div>
            {expanded && (
                <div className="mt-2 pt-2 border-t border-black/10 text-[12px] opacity-80 whitespace-pre-wrap break-words max-h-[200px] overflow-y-auto">
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
            <div className="flex justify-end">
                <div className="max-w-[68%] flex flex-col items-end text-left">
                    {contextText && <ContextBox text={contextText} />}
                    {pageContext && <PageContextBox {...pageContext} />}
                    {message.imageUrl && <ImagePreview src={message.imageUrl} />}
                    <div style={{
                        background: 'var(--color-primary-tint)',
                        borderRadius: '10px 10px 2px 10px',
                        padding: '8px 11px',
                        fontSize: '12px',
                        color: 'var(--color-text)',
                        lineHeight: 1.5,
                    }}>
                        {displayContent}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex items-start gap-2">
            <div style={{
                width: '20px',
                height: '20px',
                borderRadius: '6px',
                background: 'var(--color-primary-tint)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                marginTop: '2px',
            }}>
                <div style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: 'var(--color-primary)',
                }} />
            </div>
            <div style={{ flex: 1, fontSize: '12px', color: 'var(--color-text)', lineHeight: 1.6 }}>
                <div className="msg-content">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>
                        {message.content || ''}
                    </ReactMarkdown>
                    {message.isStreaming && (
                        <span className="chat-cursor" />
                    )}
                </div>
            </div>
        </div>
    );
};

export default MessageBubble;
