import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import './ChatInput.scss';

export default function ChatInput({ onSend, disabled }) {
    const [text, setText] = useState('');
    const { t } = useTranslation();

    const handleSubmit = (e) => {
        e.preventDefault();
        const trimmed = text.trim();
        if (!trimmed || disabled) return;
        onSend(trimmed);
        setText('');
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
        }
    };

    return (
        <form className="chatbot-input" onSubmit={handleSubmit}>
            <textarea
                className="chatbot-input__field"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t('chatbot.inputPlaceholder')}
                disabled={disabled}
                rows={1}
                maxLength={2000}
                dir="rtl"
            />
            <button
                type="submit"
                className="chatbot-input__send"
                disabled={disabled || !text.trim()}
                aria-label={t('common.send')}
            >
                {t('common.send')}
            </button>
        </form>
    );
}
