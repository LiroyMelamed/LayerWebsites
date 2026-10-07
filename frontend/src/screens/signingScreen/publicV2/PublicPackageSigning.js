import React, { useCallback, useEffect, useMemo, useState } from 'react';
import useSigningLocale from '../templates/useSigningLocale';
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

// A consent session has a separate task budget from a 200-package submission.
// Keep every ready role on a PDF together; never split a document across groups.
export function readyDocumentGroup(entries, maximum, currentDocumentId) {
    const documents = new Map();
    for (const entry of entries) {
        const id = entry.document.documentId;
        if (!documents.has(id)) documents.set(id, []);
        documents.get(id).push(entry);
    }
    const ordered = [...documents.entries()];
    const start = ordered.findIndex(([id]) => id === currentDocumentId);
    const rotated = start > 0 ? [...ordered.slice(start), ...ordered.slice(0, start)] : ordered;
    const selected = [];
    for (const [, tasks] of rotated) {
        if (selected.length + tasks.length > maximum) break;
        selected.push(...tasks);
    }
    return selected;
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
    const { t, language: locale, number } = useSigningLocale();
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
    const groupCandidate = useMemo(() => readyDocumentGroup(documents, view?.maxTasksPerSession || 200, current?.document.documentId), [documents, view?.maxTasksPerSession, current]);
    const candidateCount = new Set(groupCandidate.map(item => item.document.documentId)).size;
    const groupIds = new Set((groupSelection || []).map(item => item.document.documentId));
    const remainingAfterGroup = new Set(documents.filter(item => !groupIds.has(item.document.documentId)).map(item => item.document.documentId)).size;
    const groupLabel = candidateCount === readyDocumentCount ? t('signingV2.public.group.signAll')
        : t('signingV2.public.group.signBatch', { count: candidateCount, documentCount: number(candidateCount), total: number(readyDocumentCount) });
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
                        completionText: remainingAfterGroup > 0 ? t('signingV2.public.group.completedPart', { count: remainingAfterGroup,
                            signed: number(groupDocuments.length), remaining: number(remainingAfterGroup) }) : undefined,
                        consentText: t('signingV2.public.group.consent', { count: groupDocuments.length, documentCount: number(groupDocuments.length) }),
                        signAllLabel: groupSelection.length < documents.length ? t('signingV2.public.group.signSelected', { count: groupDocuments.length, documentCount: number(groupDocuments.length) }) : t('signingV2.public.group.signAll'),
                    } : null}
                    multiDocumentAction={!groupSelection && candidateCount > 1 ? {
                        onPress: () => setGroupSelection(groupCandidate), label: groupLabel,
                    } : null}
                    deferOtpUntilConsent={readyDocumentCount > 1}
                    nextDocument={groupSelection ? (remainingAfterGroup > 0 ? { onPress: openNext,
                        label: t('signingV2.public.group.continueRemaining', { count: remainingAfterGroup, documentCount: number(remainingAfterGroup) }) } : null)
                        : documents.length > 1 ? { onPress: openNext, label: t('signing.canvas.nextDocument') } : null}
                    onClose={() => navigate(sessionHomePath(), { replace: true })}
                />
            )}
        </SimpleScreen>
    );
}
