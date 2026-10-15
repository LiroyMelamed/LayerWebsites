import React, { useRef, useState } from 'react';
import SimpleContainer from '../../../components/simpleComponents/SimpleContainer';
import { Text14, TextBold24 } from '../../../components/specializedComponents/text/AllTextKindFile';
import SecondaryButton from '../../../components/styledComponents/buttons/SecondaryButton';
import PrimaryButton from '../../../components/styledComponents/buttons/PrimaryButton';
import StatusNotice from '../../../components/ui/StatusNotice';
import { downloadBlobAsFile } from '../../../utils/downloadBlobAsFile';
import useSigningLocale from '../templates/useSigningLocale';
import signingPublicApi from '../../../api/signingPublicApi';
import './completedPackageCopy.scss';

// Read-only capability: never mounts SignatureCanvas or creates an OTP session.
export default function CompletedPackageCopy({ token, view, onClose }) {
    const { t, direction, errorMessage } = useSigningLocale();
    const [busy, setBusy] = useState(null);
    const [error, setError] = useState(null);
    const inFlight = useRef(false);
    const download = async (id, name, receipt = false) => {
        if (inFlight.current) return;
        inFlight.current = true; setBusy(id); setError(null);
        try {
            const blob = receipt ? await signingPublicApi.evidence(token, id) : await signingPublicApi.document(token, id);
            const filename = String(name || 'document').replace(/[\\/:*?"<>|]+/g, ' ').trim().replace(/\.pdf$/i, '');
            await downloadBlobAsFile(blob, `${filename || 'document'}.pdf`);
        } catch (failure) { setError(failure); }
        finally { inFlight.current = false; setBusy(null); }
    };
    return <SimpleContainer className="lw-publicSigningScreen__container lw-completedCopy" dir={direction}>
        <SimpleContainer className="lw-publicSigningScreen__stack lw-completedCopy__content">
            <TextBold24>{t('signingV2.completedCopy.title')}</TextBold24>
            <Text14>{t('signingV2.completedCopy.help')}</Text14>
            {error && <StatusNotice embedded><p>{error?.status === 404 ? t('signingV2.completedCopy.unavailable') : errorMessage(error)}</p></StatusNotice>}
            {view.packages.map(pkg => <section key={pkg.packageId} aria-label={pkg.reference || pkg.runName}>
                <h2>{pkg.reference || pkg.runName}</h2>
                {pkg.documents.map(document => <div key={document.documentId}>
                    <h3><bdi>{document.name}</bdi></h3>
                    <PrimaryButton onPress={() => download(document.documentId, document.name)} disabled={Boolean(busy) || !document.final}
                        aria-label={`${t('signingV2.public.downloadFinal')}: ${document.name}`}>
                        {busy === document.documentId ? t('common.loading') : t('signingV2.public.downloadFinal')}
                    </PrimaryButton>
                </div>)}
                {pkg.evidence && <SecondaryButton onPress={() => download(pkg.packageId, t('signingV2.public.evidenceName'), true)} disabled={Boolean(busy)}>
                    {t('signingV2.completedCopy.receipt')}
                </SecondaryButton>}
            </section>)}
            <SecondaryButton onPress={onClose}>{t('signingV2.completedCopy.finish')}</SecondaryButton>
        </SimpleContainer>
    </SimpleContainer>;
}
