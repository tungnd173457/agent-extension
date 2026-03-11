import React, { useEffect, useRef } from 'react';
import { useChatContext } from '../../context/ChatContext';
import MessageBubble from './MessageBubble';
import TypingIndicator from '../shared/TypingIndicator';

const MessageList: React.FC = () => {
    const { messages, isStreaming } = useChatContext();
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isStreaming]);

    // Only show TypingIndicator when streaming but no token has arrived yet
    // Once the first token arrives, the assistant message with isStreaming=true
    // will appear in the list and show its own cursor instead.
    const hasStreamingMessage = messages.some(m => m.isStreaming);
    const showTypingIndicator = isStreaming && !hasStreamingMessage;

    return (
        <div className="flex flex-col gap-1 p-4">
            {messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} />
            ))}
            {showTypingIndicator && <TypingIndicator />}
            <div ref={bottomRef} />
        </div>
    );
};

export default MessageList;
