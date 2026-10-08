import { useTranslation } from 'react-i18next';
import StatusNotice from './StatusNotice';

export default function RequestLoadError({ onRetry }) {
    const { t } = useTranslation();
    return (
        <StatusNotice onAction={onRetry} actionLabel={t('common.retry')}>
            <p>{t('errors.loadFailed')}</p>
        </StatusNotice>
    );
}
