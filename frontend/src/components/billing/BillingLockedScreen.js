import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import SimpleScreen from '../simpleComponents/SimpleScreen';
import SimpleCard from '../simpleComponents/SimpleCard';
import SimpleButton from '../simpleComponents/SimpleButton';
import { Text14, TextBold24 } from '../specializedComponents/text/AllTextKindFile';
import { images } from '../../assets/images/images';
import { AdminStackName } from '../../navigation/AdminStack';
import { PlanUsageScreenName } from '../../navigation/screenPaths';
import { useBillingLock } from '../../providers/BillingLockProvider';
import './BillingLockedScreen.scss';

export default function BillingLockedScreen() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { graceUntil } = useBillingLock();
    const isPlatformAdmin = typeof window !== 'undefined' && localStorage.getItem('isPlatformAdmin') === 'true';

    return (
        <SimpleScreen imageBackgroundSource={images.Backgrounds.AppBackground}>
            <SimpleCard className="lw-billingLockedScreen__card">
                <TextBold24>{t('billingLock.title')}</TextBold24>
                <Text14 className="lw-billingLockedScreen__body">{t('billingLock.body')}</Text14>
                {graceUntil && (
                    <Text14 className="lw-billingLockedScreen__deadline">
                        {t('billingLock.deadline', { date: new Date(graceUntil).toLocaleString('he-IL') })}
                    </Text14>
                )}
                {isPlatformAdmin ? (
                    <SimpleButton
                        className="lw-billingLockedScreen__button"
                        onPress={() => navigate(AdminStackName + PlanUsageScreenName)}
                    >
                        <Text14>{t('billingLock.payCta')}</Text14>
                    </SimpleButton>
                ) : (
                    <Text14 className="lw-billingLockedScreen__hint">{t('billingLock.contactAdmin')}</Text14>
                )}
            </SimpleCard>
        </SimpleScreen>
    );
}
