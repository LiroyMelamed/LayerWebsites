import React, { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import SimpleScreen from '../../components/simpleComponents/SimpleScreen';
import SimpleContainer from '../../components/simpleComponents/SimpleContainer';
import SimplePopUp from '../../components/simpleComponents/SimplePopUp';
import SimpleInput from '../../components/simpleComponents/SimpleInput';
import PrimaryButton from '../../components/styledComponents/buttons/PrimaryButton';
import SecondaryButton from '../../components/styledComponents/buttons/SecondaryButton';
import ErrorText from '../../components/styledComponents/text/ErrorText';
import { TextBold18, Text12, Text14 } from '../../components/specializedComponents/text/AllTextKindFile';
import { colors } from '../../constant/colors';
import { buttonSizes } from '../../styles/buttons/buttonSizes';
import ChatWindow from '../../components/chatbot/ChatWindow';
import ChatInput from '../../components/chatbot/ChatInput';
import chatbotApi from '../../api/chatbotApi';
import './ChatBotPage.scss';

export const ChatBotPageName = '/chatbot';

export default function ChatBotPage() {
    const { t } = useTranslation();

    const [messages, setMessages] = useState([]);
    const [isTyping, setIsTyping] = useState(false);
    const [sessionId, setSessionId] = useState(null);
    const [verified, setVerified] = useState(false);
    const [error, setError] = useState(null);

    // OTP verification state
    const [showOtpModal, setShowOtpModal] = useState(false);
    const [otpPhone, setOtpPhone] = useState('');
    const [otpCode, setOtpCode] = useState('');
    const [otpStep, setOtpStep] = useState('phone'); // 'phone' | 'code'
    const [otpLoading, setOtpLoading] = useState(false);
    const [otpError, setOtpError] = useState('');

    const handleSend = useCallback(async (text) => {
        setError(null);

        const userMsg = { role: 'user', content: text, timestamp: new Date().toISOString() };
        setMessages((prev) => [...prev, userMsg]);
        setIsTyping(true);

        try {
            const res = await chatbotApi.sendMessage(text, sessionId);

            if (res.status === 200) {
                const data = res.data;

                if (data.sessionId) setSessionId(data.sessionId);
                if (data.verified) setVerified(true);

                if (data.requiresVerification) {
                    setShowOtpModal(true);
                }

                const assistantMsg = {
                    role: 'assistant',
                    content: data.response,
                    timestamp: new Date().toISOString(),
                };
                setMessages((prev) => [...prev, assistantMsg]);
            } else {
                const errMsg = res.data?.message || t('chatbot.errorGeneric');
                setError(errMsg);
                setMessages((prev) => [
                    ...prev,
                    { role: 'assistant', content: errMsg, timestamp: new Date().toISOString() },
                ]);
            }
        } catch {
            setError(t('chatbot.errorGeneric'));
            setMessages((prev) => [
                ...prev,
                { role: 'assistant', content: t('chatbot.errorGeneric'), timestamp: new Date().toISOString() },
            ]);
        } finally {
            setIsTyping(false);
        }
    }, [sessionId, t]);

    const handleRequestOtp = async () => {
        if (!otpPhone.trim()) return;
        setOtpLoading(true);
        setOtpError('');

        try {
            const res = await chatbotApi.requestOtp(otpPhone, sessionId);
            if (res.status === 200) {
                setOtpStep('code');
            } else {
                setOtpError(res.data?.message || t('chatbot.otpSendFailed'));
            }
        } catch {
            setOtpError(t('chatbot.otpSendFailed'));
        } finally {
            setOtpLoading(false);
        }
    };

    const handleVerifyOtp = async () => {
        if (!otpCode.trim()) return;
        setOtpLoading(true);
        setOtpError('');

        try {
            const res = await chatbotApi.verifyOtp(otpPhone, otpCode, sessionId);
            if (res.status === 200) {
                const data = res.data;
                setSessionId(data.sessionId);
                setVerified(true);
                setShowOtpModal(false);
                setOtpStep('phone');
                setOtpPhone('');
                setOtpCode('');

                setMessages((prev) => [
                    ...prev,
                    {
                        role: 'assistant',
                        content: t('chatbot.verificationSuccess'),
                        timestamp: new Date().toISOString(),
                    },
                ]);
            } else {
                setOtpError(res.data?.message || t('chatbot.otpInvalid'));
            }
        } catch {
            setOtpError(t('chatbot.otpInvalid'));
        } finally {
            setOtpLoading(false);
        }
    };

    const normalizePhone = (raw) => {
        const digitsOnly = String(raw).replace(/\D/g, '');
        let normalized = digitsOnly;
        if (normalized.startsWith('972') && normalized.length >= 11) {
            normalized = '0' + normalized.slice(3);
        }
        return normalized.slice(0, 10);
    };

    return (
        <SimpleScreen className="lw-chatbotPage">
            <SimpleContainer className="lw-chatbotPage__header">
                <TextBold18 color={colors.white}>{t('chatbot.title')}</TextBold18>
                {verified && (
                    <Text12 color={colors.white} className="lw-chatbotPage__badge">
                        {t('chatbot.verifiedBadge')}
                    </Text12>
                )}
            </SimpleContainer>

            <ChatWindow messages={messages} isTyping={isTyping} />

            {error && (
                <SimpleContainer className="lw-chatbotPage__error">
                    <ErrorText>{error}</ErrorText>
                </SimpleContainer>
            )}

            <ChatInput onSend={handleSend} disabled={isTyping} />

            <SimplePopUp
                isOpen={showOtpModal}
                onClose={() => setShowOtpModal(false)}
                className="lw-chatbotOtp"
            >
                <TextBold18 color={colors.text}>{t('chatbot.otpTitle')}</TextBold18>
                <Text14 color={colors.winter}>{t('chatbot.otpDescription')}</Text14>

                {otpStep === 'phone' && (
                    <>
                        <SimpleInput
                            title={t('common.phoneNumber')}
                            value={otpPhone}
                            onChange={(e) => setOtpPhone(normalizePhone(e.target.value))}
                            type="tel"
                            timeToWaitInMilli={0}
                        />
                        <PrimaryButton
                            onPress={handleRequestOtp}
                            disabled={otpLoading || otpPhone.length < 9}
                            size={buttonSizes.MEDIUM}
                        >
                            {otpLoading ? t('chatbot.sending') : t('chatbot.sendOtp')}
                        </PrimaryButton>
                    </>
                )}

                {otpStep === 'code' && (
                    <>
                        <SimpleInput
                            title={t('chatbot.otpCodePlaceholder')}
                            value={otpCode}
                            onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            timeToWaitInMilli={0}
                        />
                        <PrimaryButton
                            onPress={handleVerifyOtp}
                            disabled={otpLoading || otpCode.length < 6}
                            size={buttonSizes.MEDIUM}
                        >
                            {otpLoading ? t('chatbot.verifying') : t('chatbot.verifyOtp')}
                        </PrimaryButton>
                        <SecondaryButton
                            onPress={() => { setOtpStep('phone'); setOtpCode(''); setOtpError(''); }}
                            disabled={otpLoading}
                            size={buttonSizes.MEDIUM}
                        >
                            {t('common.back')}
                        </SecondaryButton>
                    </>
                )}

                {otpError && <ErrorText>{otpError}</ErrorText>}
            </SimplePopUp>
        </SimpleScreen>
    );
}
