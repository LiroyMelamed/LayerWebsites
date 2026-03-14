import React, { useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import ChatMessage from './ChatMessage';
import './ChatWindow.scss';

export default function ChatWindow({ messages, isTyping }) {
    const { t } = useTranslation();
    const bottomRef = useRef(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isTyping]);

    return (
        <div className="chatbot-window">
            {messages.length === 0 && !isTyping && (
                <div className="chatbot-window__welcome">
                    <p className="chatbot-window__welcome-title">{t('chatbot.welcomeTitle')}</p>
                    <p className="chatbot-window__welcome-sub">{t('chatbot.welcomeSubtitle')}</p>
                </div>
            )}

            {messages.map((msg, idx) => (
                <ChatMessage
                    key={idx}
                    role={msg.role}
                    content={msg.content}
                    timestamp={msg.timestamp}
                />
            ))}

            {isTyping && (
                <div className="chatbot-window__typing">
                    <div className="chatbot-window__typing-dots">
                        <span />
                        <span />
                        <span />
                    </div>
                </div>
            )}

            <div ref={bottomRef} />
        </div>
    );
}
