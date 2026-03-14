import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import SimpleContainer from '../simpleComponents/SimpleContainer';
import SimpleTextArea from '../simpleComponents/SimpleTextArea';
import PrimaryButton from '../styledComponents/buttons/PrimaryButton';
import { buttonSizes } from '../../styles/buttons/buttonSizes';
import './ChatInput.scss';

export default function ChatInput({ onSend, disabled }) {
    const [text, setText] = useState('');
    const { t } = useTranslation();

    const handleSubmit = () => {
        const trimmed = text.trim();
        if (!trimmed || disabled) return;
        onSend(trimmed);
        setText('');
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    };

    return (
        <SimpleContainer className="lw-chatInput">
            <SimpleTextArea
                className="lw-chatInput__field"
                value={text}
                onChange={(val) => setText(val)}
                onKeyDown={handleKeyDown}
                title={t('chatbot.inputPlaceholder')}
                disabled={disabled}
                rows={1}
                maxLength={2000}
            />
            <PrimaryButton
                className="lw-chatInput__send"
                size={buttonSizes.SMALL}
                onPress={handleSubmit}
                disabled={disabled || !text.trim()}
            >
                {t('common.send')}
            </PrimaryButton>
        </SimpleContainer>
    );
}
