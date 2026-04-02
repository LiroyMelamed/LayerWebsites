import React from 'react';
import SimpleContainer from '../../../simpleComponents/SimpleContainer';
import SecondaryButton from '../../../styledComponents/buttons/SecondaryButton';
import { useTranslation } from 'react-i18next';

import './addFieldPanel.scss';

export default function AddFieldPanel({ fieldTypeOptions, onSelectField, onClose, isInline }) {
    const { t } = useTranslation();

    return (
        <SimpleContainer className={`lw-addFieldPanel ${isInline ? 'lw-addFieldPanel--inline' : 'lw-addFieldPanel--popup'}`}>
            <SimpleContainer className="lw-addFieldPanel__header">
                <span className="lw-addFieldPanel__title">{t('signing.fieldSettings.addFieldTitle')}</span>
                {!isInline && (
                    <SecondaryButton onPress={onClose} className="lw-addFieldPanel__close">
                        {t('common.close')}
                    </SecondaryButton>
                )}
            </SimpleContainer>
            {fieldTypeOptions.map((option) => (
                <SecondaryButton
                    key={option.id}
                    className="lw-addFieldPanel__action"
                    onPress={() => onSelectField(option.id)}
                >
                    {option.label}
                </SecondaryButton>
            ))}
        </SimpleContainer>
    );
}
