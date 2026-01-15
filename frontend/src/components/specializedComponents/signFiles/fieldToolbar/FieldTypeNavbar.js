import React from 'react';
import SimpleContainer from '../../../simpleComponents/SimpleContainer';
import { useTranslation } from 'react-i18next';
import PrimaryButton from '../../../styledComponents/buttons/PrimaryButton';
import SecondaryButton from '../../../styledComponents/buttons/SecondaryButton';
import './fieldToolbar.scss';
import './fieldContextMenu.scss';

export default function FieldTypeNavbar({
    selected = 'signature',
    onSelect = () => { },
    fieldTypes,
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
            {resolvedTypes.map((ft) => (
                <div
                    key={ft.id}
                    className={`lw-fieldTypeNavbar__btn ${selected === ft.id ? 'is-selected' : ''}`}
                    onClick={() => onSelect(ft.id)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onSelect(ft.id);
                        }
                    }}
                    role="button"
                    tabIndex={0}
                    title={ft.label}
                    aria-pressed={selected === ft.id}
                >
                    <span className="lw-fieldTypeNavbar__icon">{ft.shortLabel || ft.label.charAt(0)}</span>
                    <span className="lw-fieldTypeNavbar__label">{ft.label}</span>
                </div>
            ))}
        </SimpleContainer>
    );
}
