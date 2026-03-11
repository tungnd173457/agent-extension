import React from 'react';
import { useChatContext } from '../../context/ChatContext';

export function ChatHeader() {
    const { currentConversation } = useChatContext();
    const title = currentConversation?.title || 'Side Agent';

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '0 12px',
            height: '40px',
            borderBottom: '1px solid var(--color-border-light)',
            background: 'var(--color-bg)',
            flexShrink: 0,
        }}>
            <div style={{
                width: '16px',
                height: '16px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #7c3aed, #a78bfa)',
                flexShrink: 0,
            }} />
            <span style={{
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--color-text)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
            }}>
                {title}
            </span>
        </div>
    );
}

export default ChatHeader;
