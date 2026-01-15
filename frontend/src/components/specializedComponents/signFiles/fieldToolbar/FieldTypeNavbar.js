import React from 'react';
import SimpleContainer from '../../../simpleComponents/SimpleContainer';
import { useTranslation } from 'react-i18next';
import PrimaryButton from '../../../styledComponents/buttons/PrimaryButton';
import SecondaryButton from '../../../styledComponents/buttons/SecondaryButton';
import './fieldToolbar.scss';
import './fieldContextMenu.scss';

export default function FieldTypeNavbar({
    selected = 'signature',
    onSelect = () => {},
    fieldTypes,
    signers = [],
    selectedSignerId = null,
    onSelectSigner = () => {},
}) {
    const { t } = useTranslation();
    const resolvedTypes = fieldTypes || [
        { id: 'signature', label: t('signing.fields.signature'), shortLabel: t('signing.fields.signatureShort') },
        { id: 'email', label: t('signing.fields.email'), shortLabel: t('signing.fields.emailShort') },
        { id: 'phone', label: t('signing.fields.phone'), shortLabel: t('signing.fields.phoneShort') },
        { id: 'initials', label: t('signing.fields.initials'), shortLabel: t('signing.fields.initialsShort') },
        { id: 'text', label: t('signing.fields.text'), shortLabel: t('signing.fields.textShort') },
        { id: 'date', label: t('signing.fields.date'), shortLabel: t('signing.fields.dateShort') },
        { id: 'checkbox', label: t('signing.fields.checkbox'), shortLabel: t('signing.fields.checkboxShort') },
        { id: 'idnumber', label: t('signing.fields.idNumber'), shortLabel: t('signing.fields.idNumberShort') },
    ];

    return (
        <SimpleContainer className="lw-fieldTypeNavbar">
            {Array.isArray(signers) && signers.length > 1 && (
                <SimpleContainer className="lw-fieldTypeNavbar__signerRow">
                    <span className="lw-fieldTypeNavbar__signerLabel">{t('signing.upload.signerSelectorLabel')}</span>
                    <SimpleContainer className="lw-fieldTypeNavbar__signerButtons">
                        {signers.map((s) => {
                            const isSelected = Number(s?.UserId) === Number(selectedSignerId);
                            const Button = isSelected ? PrimaryButton : SecondaryButton;
                            return (
                                <Button
                                    key={s?.UserId}
                                    onPress={() => onSelectSigner(s?.UserId)}
                                    className="lw-fieldTypeNavbar__signerButton"
                                >
                                    {s?.Name || t('signing.signerFallback', { index: 1 })}
                                </Button>
                            );
                        })}
                    </SimpleContainer>
                </SimpleContainer>
            )}
            {resolvedTypes.map((ft) => (
                <button
                    key={ft.id}
                    type="button"
                    className={`lw-fieldTypeNavbar__btn ${selected === ft.id ? 'is-selected' : ''}`}
                    onClick={() => onSelect(ft.id)}
                    title={ft.label}
                >
                    <span className="lw-fieldTypeNavbar__icon">{ft.shortLabel || ft.label.charAt(0)}</span>
                    <span className="lw-fieldTypeNavbar__label">{ft.label}</span>
                </button>
            ))}
        </SimpleContainer>
    );
}
