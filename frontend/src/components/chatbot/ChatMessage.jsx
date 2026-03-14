import React from 'react';
import './ChatMessage.scss';

export default function ChatMessage({ role, content, timestamp }) {
    const isUser = role === 'user';

    return (
        <div className={`chatbot-message ${isUser ? 'chatbot-message--user' : 'chatbot-message--assistant'}`}>
            <div className="chatbot-message__bubble">
                <p className="chatbot-message__text">{content}</p>
                {timestamp && (
                    <span className="chatbot-message__time">
                        {new Date(timestamp).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                )}
            </div>
        </div>
    );
}
