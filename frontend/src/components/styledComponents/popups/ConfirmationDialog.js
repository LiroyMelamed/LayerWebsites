import React from 'react';
import SimpleContainer from '../../simpleComponents/SimpleContainer';
import PrimaryButton from '../buttons/PrimaryButton';
import SecondaryButton from '../buttons/SecondaryButton';
import { TextBold20, Text14 } from '../../specializedComponents/text/AllTextKindFile';

import './ConfirmationDialog.scss';

/**
 * A reusable confirmation dialog (displayed inside a popup).
 *
 * Props:
 *   title       – header text
 *   message     – body text
 *   confirmText – label for the confirm button (default: "אישור")
 *   cancelText  – label for the cancel button  (default: "ביטול")
 *   onConfirm   – called when the user confirms
 *   onCancel    – called when the user cancels
 *   isPerforming – shows spinner on confirm button
 *   danger      – if true, confirm button is styled red
 */
export default function ConfirmationDialog({
    title,
    message,
    confirmText = 'אישור',
    cancelText = 'ביטול',
    onConfirm,
    onCancel,
    isPerforming = false,
    danger = false,
}) {
    return (
        <SimpleContainer className="lw-confirmationDialog">
            <SimpleContainer className="lw-confirmationDialog__card">
                {title && <TextBold20 className="lw-confirmationDialog__title">{title}</TextBold20>}
                {message && <Text14 className="lw-confirmationDialog__message">{message}</Text14>}

                <SimpleContainer className="lw-confirmationDialog__actions">
                    <SecondaryButton onPress={onCancel} disabled={isPerforming}>
                        {cancelText}
                    </SecondaryButton>
                    <PrimaryButton
                        onPress={onConfirm}
                        isPerforming={isPerforming}
                        className={danger ? 'lw-confirmationDialog__btn--danger' : ''}
                    >
                        {confirmText}
                    </PrimaryButton>
                </SimpleContainer>
            </SimpleContainer>
        </SimpleContainer>
    );
}
