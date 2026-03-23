import React, { useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import SimpleContainer from '../simpleComponents/SimpleContainer';
import { TextBold20, Text14 } from '../specializedComponents/text/AllTextKindFile';
import { colors } from '../../constant/colors';
import ChatMessage from './ChatMessage';
import './ChatWindow.scss';

export default function ChatWindow({ messages, isTyping }) {
    const { t } = useTranslation();
    const bottomRef = useRef(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isTyping]);

    return (
        <SimpleContainer className="lw-chatWindow">
            {messages.length === 0 && !isTyping && (
                <SimpleContainer className="lw-chatWindow__welcome">
                    <TextBold20 color={colors.text}>{t('chatbot.welcomeTitle')}</TextBold20>
                    <Text14 color={colors.winter} className="lw-chatWindow__welcomeSub">
                        {t('chatbot.welcomeSubtitle')}
                    </Text14>
                </SimpleContainer>
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
                <SimpleContainer className="lw-chatWindow__typing">
                    <SimpleContainer className="lw-chatWindow__thinkingDots">
                        <span /><span /><span />
                    </SimpleContainer>
                </SimpleContainer>
            )}

            <SimpleContainer ref={bottomRef} />
        </SimpleContainer>
    );
}
