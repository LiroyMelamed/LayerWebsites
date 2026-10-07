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
import { createV2DocumentAdapter } from './v2SigningCanvasAdapter';

export const PublicPackageSigningName = '/ViewSignedDocument/Sign';

export const latinDigits = value => String(value).replace(/[\u0660-\u0669\u06F0-\u06F9]/g, digit => String(digit.charCodeAt(0) & 0xF));

function documentsOf(view) {
    const items = [];
    (view?.packages || []).forEach(pkg => (pkg.documents || []).forEach(document => {
        const task = (document.tasks || []).find(item => item.state === 'ready');
        if (task) items.push({ pkg, document, task });
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
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [token] = useState(readGrantToken);
    const [view, setView] = useState(null);
    const [loadError, setLoadError] = useState(token ? null : { code: 'MISSING_TOKEN' });
    const [index, setIndex] = useState(0);

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
    const current = documents[index] || signedDocumentOf(view) || waitingDocumentOf(view);
    const adapter = useMemo(() => (current ? createV2DocumentAdapter({
        token,
        document: current.document,
        task: current.task,
        personName: view?.person?.name,
        consentVersion: view?.consentVersion,
        locale: view?.locale,
    }) : null), [token, current, view?.person?.name, view?.consentVersion, view?.locale]);

    const openNext = async () => {
        const next = await load();
        const queue = documentsOf(next);
        const position = queue.findIndex(item => item.document.documentId === current?.document?.documentId);
        const following = position >= 0 ? position + 1 : 0;
        setIndex(queue.length ? Math.min(following, queue.length - 1) : 0);
    };

    return (
        <SimpleScreen imageBackgroundSource={images.Backgrounds.AppBackground} className="lw-publicSigningScreen">
            {!token || loadError ? (
                <SimpleContainer className="lw-publicSigningScreen__container">
                    <SimpleContainer className="lw-publicSigningScreen__stack">
                        <TextBold24>{t('signing.invalidLinkTitle')}</TextBold24>
                        <Text14>{t('signing.missingToken')}</Text14>
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
                    key={`${current.document.documentId}:${current.task.taskId}:${current.task.state}`}
                    publicToken={token}
                    variant="screen"
                    filesApi={adapter}
                    loadPublicPdf={() => signingPublicApi.document(token, current.document.documentId)}
                    nextDocument={documents.length > 1 && index < documents.length - 1 ? { onPress: openNext, label: t('signing.canvas.nextDocument') } : null}
                    onClose={() => {
                        if (documents.length > 1 && index < documents.length - 1) openNext();
                        else navigate(sessionHomePath(), { replace: true });
                    }}
                />
            )}
        </SimpleScreen>
    );
}
