import React from 'react';
import SimpleContainer from '../simpleComponents/SimpleContainer';
import { Text14, Text12 } from '../specializedComponents/text/AllTextKindFile';
import { colors } from '../../constant/colors';
import './ChatMessage.scss';

export default function ChatMessage({ role, content, timestamp }) {
    const isUser = role === 'user';

    return (
        <SimpleContainer className={`lw-chatMessage ${isUser ? 'lw-chatMessage--user' : 'lw-chatMessage--assistant'}`}>
            <SimpleContainer className="lw-chatMessage__bubble">
                <Text14
                    className="lw-chatMessage__text"
                    color={isUser ? colors.white : colors.text}
                >
                    {content}
                </Text14>
                {timestamp && (
                    <Text12 className="lw-chatMessage__time">
                        {new Date(timestamp).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
                    </Text12>
                )}
            </SimpleContainer>
        </SimpleContainer>
    );
}
