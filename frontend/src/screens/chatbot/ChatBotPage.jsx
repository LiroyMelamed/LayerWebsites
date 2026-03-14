import React, { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
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
        <div className="chatbot-page" dir="rtl">
            <header className="chatbot-page__header">
                <h1 className="chatbot-page__title">{t('chatbot.title')}</h1>
                {verified && (
                    <span className="chatbot-page__badge">{t('chatbot.verifiedBadge')}</span>
                )}
            </header>

            <ChatWindow messages={messages} isTyping={isTyping} />

            {error && (
                <div className="chatbot-page__error">{error}</div>
            )}

            <ChatInput onSend={handleSend} disabled={isTyping} />

            {/* OTP Verification Modal */}
            {showOtpModal && (
                <div className="chatbot-otp-overlay" onClick={() => setShowOtpModal(false)}>
                    <div className="chatbot-otp-modal" dir="rtl" onClick={(e) => e.stopPropagation()}>
                        <h2 className="chatbot-otp-modal__title">{t('chatbot.otpTitle')}</h2>
                        <p className="chatbot-otp-modal__desc">{t('chatbot.otpDescription')}</p>

                        {otpStep === 'phone' && (
                            <>
                                <input
                                    className="chatbot-otp-modal__input"
                                    type="tel"
                                    value={otpPhone}
                                    onChange={(e) => setOtpPhone(normalizePhone(e.target.value))}
                                    placeholder={t('common.phoneNumber')}
                                    maxLength={10}
                                    dir="ltr"
                                />
                                <button
                                    className="chatbot-otp-modal__btn"
                                    onClick={handleRequestOtp}
                                    disabled={otpLoading || otpPhone.length < 9}
                                >
                                    {otpLoading ? t('chatbot.sending') : t('chatbot.sendOtp')}
                                </button>
                            </>
                        )}

                        {otpStep === 'code' && (
                            <>
                                <input
                                    className="chatbot-otp-modal__input"
                                    type="text"
                                    inputMode="numeric"
                                    value={otpCode}
                                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    placeholder={t('chatbot.otpCodePlaceholder')}
                                    maxLength={6}
                                    dir="ltr"
                                    autoFocus
                                />
                                <button
                                    className="chatbot-otp-modal__btn"
                                    onClick={handleVerifyOtp}
                                    disabled={otpLoading || otpCode.length < 6}
                                >
                                    {otpLoading ? t('chatbot.verifying') : t('chatbot.verifyOtp')}
                                </button>
                                <button
                                    className="chatbot-otp-modal__btn chatbot-otp-modal__btn--secondary"
                                    onClick={() => { setOtpStep('phone'); setOtpCode(''); setOtpError(''); }}
                                    disabled={otpLoading}
                                >
                                    {t('common.back')}
                                </button>
                            </>
                        )}

                        {otpError && (
                            <p className="chatbot-otp-modal__error">{otpError}</p>
                        )}

                        <button
                            className="chatbot-otp-modal__close"
                            onClick={() => setShowOtpModal(false)}
                            aria-label={t('common.close')}
                        >
                            &times;
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
