import React, { useEffect, useRef } from 'react';
import SimplePopUp from '../../../components/simpleComponents/SimplePopUp';
import ConfirmationDialog from '../../../components/styledComponents/popups/ConfirmationDialog';
import useSigningLocale from './useSigningLocale';

function Content(props) {
    const content = useRef(null);
    useEffect(() => {
        const previous = document.activeElement;
        content.current?.querySelector('button')?.focus();
        return () => { if (previous?.isConnected) previous.focus?.(); };
    }, []);
    return <div ref={content}><ConfirmationDialog {...props} /></div>;
}

export default function TemplateArchiveConfirmation({ version, busy, onConfirm, onCancel }) {
    const { t, direction } = useSigningLocale();
    const title = t(version.archived ? 'signingV2.authoring.restore' : 'signingV2.workspace.archive');
    return <SimplePopUp isOpen onClose={busy ? undefined : onCancel} role="dialog" aria-modal="true" aria-label={title} dir={direction}>
        <Content title={title} message={t(`signingV2.authoring.${version.archived ? 'restoreConfirm' : 'archiveConfirm'}`, { name: version.definition.name })}
            confirmText={title} cancelText={t('common.cancel')} onConfirm={onConfirm} onCancel={onCancel} isPerforming={busy} />
    </SimplePopUp>;
}
