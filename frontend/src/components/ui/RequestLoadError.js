import { useTranslation } from 'react-i18next';
import SimpleCard from '../simpleComponents/SimpleCard';
import SecondaryButton from '../styledComponents/buttons/SecondaryButton';

export default function RequestLoadError({ onRetry }) {
    const { t } = useTranslation();
    return (
        <SimpleCard>
            <p role="alert">{t('errors.loadFailed')}</p>
            <SecondaryButton onPress={onRetry}>{t('common.retry')}</SecondaryButton>
        </SimpleCard>
    );
}
