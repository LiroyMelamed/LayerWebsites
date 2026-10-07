import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { sessionHomePath } from '../../../navigation/LoginStack';
import SimpleScreen from '../../../components/simpleComponents/SimpleScreen';
import SimpleContainer from '../../../components/simpleComponents/SimpleContainer';
import { Text14, TextBold24 } from '../../../components/specializedComponents/text/AllTextKindFile';
import SignatureCanvas from '../../../components/specializedComponents/signFiles/SignatureCanvas';
import { images } from '../../../assets/images/images';
import signingPublicApi, { readGrantToken } from '../../../api/signingPublicApi';
import SecondaryButton from '../../../components/styledComponents/buttons/SecondaryButton';
import { createV2DocumentAdapter } from './v2SigningCanvasAdapter';

export const PublicPackageSigningName = '/ViewSignedDocument/Sign';

export const latinDigits = value => String(value).replace(/[\u0660-\u0669\u06F0-\u06F9]/g, digit => String(digit.charCodeAt(0) & 0xF));

function documentsOf(view) {
    const items = [];
    (view?.packages || []).forEach(pkg => (pkg.documents || []).forEach(document => {
        (document.tasks || []).filter(item => item.state === 'ready').forEach(task => items.push({ pkg, document, task }));
    }));
    return items;
}

function signedDocumentOf(view) {
    for (const pkg of view?.packages || []) {
        for (const document of pkg.documents || []) {
            const task = (document.tasks || []).find(item => item.state === 'accepted');
            if (task) return { pkg, document, task };
        }
    }
    return null;
}

function waitingDocumentOf(view) {
    for (const pkg of view?.packages || []) {
        for (const document of pkg.documents || []) {
            const task = (document.tasks || []).find(item => item.state === 'waiting');
            if (task) return { pkg, document, task };
        }
    }
    return null;
}

export default function PublicPackageSigning() {
    const { t, i18n } = useTranslation();
    const navigate = useNavigate();
    const [token] = useState(readGrantToken);
    const [view, setView] = useState(null);
    const [loadError, setLoadError] = useState(token ? null : { code: 'MISSING_TOKEN' });
    const [index, setIndex] = useState(0);
    const [groupSelection, setGroupSelection] = useState(null);

    const load = useCallback(async () => {
        if (!token) return null;
        try {
            const next = await signingPublicApi.describe(token);
            setView(next);
            setLoadError(null);
            return next;
        } catch (error) {
            setLoadError(error?.status === 404 ? { code: 'NOT_FOUND' } : error);
            return null;
        }
    }, [token]);

    useEffect(() => { load(); }, [load]);
    useEffect(() => {
        const replaced = () => { if (/^#[A-Za-z0-9_-]{43}$/.test(window.location.hash)) window.location.reload(); };
        window.addEventListener('hashchange', replaced);
        return () => window.removeEventListener('hashchange', replaced);
    }, []);

    const documents = useMemo(() => documentsOf(view), [view]);
    const readyDocumentCount = new Set(documents.map(item => item.document.documentId)).size;
    const current = documents[Math.min(index, documents.length - 1)] || signedDocumentOf(view) || waitingDocumentOf(view);
    const locale = String(i18n.resolvedLanguage || i18n.language || 'he').split('-')[0];
    const adapter = useMemo(() => (current ? createV2DocumentAdapter({
        token, document: current.document, task: current.task, entries: groupSelection || undefined,
        personName: view?.person?.name, consentVersion: view?.consentVersion, locale,
    }) : null), [token, current, groupSelection, view?.person?.name, view?.consentVersion, locale]);
    const groupDocuments = useMemo(() => groupSelection ? [...new Map(groupSelection.map(item => [item.document.documentId, {
        id: item.document.documentId,
        name: `${item.document.name} — ${item.pkg.reference || item.pkg.otherParticipants?.join(', ') || item.pkg.runName || ''}`,
    }])).values()] : null, [groupSelection]);
    const loadGroupPdf = useCallback(documentId => signingPublicApi.document(token, documentId), [token]);

    const openNext = async () => {
        setGroupSelection(null);
        const next = await load();
        const queue = documentsOf(next);
        const position = queue.findIndex(item => item.task.taskId === current?.task?.taskId);
        const following = position >= 0 ? position + 1 : 0;
        setIndex(queue.length ? Math.min(following, queue.length - 1) : 0);
    };

    return (
        <SimpleScreen imageBackgroundSource={images.Backgrounds.AppBackground} className="lw-publicSigningScreen">
            {!token || loadError ? (
                <SimpleContainer className="lw-publicSigningScreen__container">
                    <SimpleContainer className="lw-publicSigningScreen__stack">
                        <TextBold24>{t('signing.invalidLinkTitle')}</TextBold24>
                        <Text14>{t(!token || loadError?.code === 'MISSING_TOKEN' ? 'signing.missingToken' : loadError?.code === 'NOT_FOUND' ? 'signingV2.public.errors.NOT_FOUND' : 'signingV2.public.errors.REQUEST_FAILED')}</Text14>
                        {token && loadError?.code !== 'NOT_FOUND' && <SecondaryButton onPress={load}>{t('signingV2.public.retry')}</SecondaryButton>}
                    </SimpleContainer>
                </SimpleContainer>
            ) : !view ? (
                <SimpleContainer className="lw-publicSigningScreen__container">
                    <Text14>{t('common.loading')}</Text14>
                </SimpleContainer>
            ) : !current ? (
                <SimpleContainer className="lw-publicSigningScreen__container">
                    <SimpleContainer className="lw-publicSigningScreen__stack">
                        <TextBold24>{t('signing.public.closedTitle')}</TextBold24>
                        <Text14>{t('signing.public.closedHint')}</Text14>
                    </SimpleContainer>
                </SimpleContainer>
            ) : (
                <SignatureCanvas
                    key={`${groupSelection ? groupSelection.map(item => item.task.taskId).join(':') : current.task.taskId}:${locale}`}
                    publicToken={token}
                    variant="screen"
                    filesApi={adapter}
                    loadPublicPdf={() => signingPublicApi.document(token, current.document.documentId)}
                    documentGroup={groupSelection ? {
                        documents: groupDocuments, loadPdf: loadGroupPdf,
                        consentText: t('signingV2.public.group.consent', { count: groupDocuments.length }),
                        signAllLabel: t('signingV2.public.group.signAll'),
                    } : null}
                    multiDocumentAction={!groupSelection && readyDocumentCount > 1 && documents.length <= (view.maxTasksPerSession || 200) ? {
                        onPress: () => setGroupSelection(documents), label: t('signingV2.public.group.signAll'),
                    } : null}
                    deferOtpUntilConsent={readyDocumentCount > 1}
                    nextDocument={!groupSelection && documents.length > 1 ? { onPress: openNext, label: t('signing.canvas.nextDocument') } : null}
                    onClose={() => navigate(sessionHomePath(), { replace: true })}
                />
            )}
        </SimpleScreen>
    );
}
