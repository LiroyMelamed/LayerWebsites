import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FileText, FileCheck2, FolderOpen, ArrowLeft } from 'lucide-react';
import SimpleScreen from '../../../components/simpleComponents/SimpleScreen';
import SimpleScrollView from '../../../components/simpleComponents/SimpleScrollView';
import SimplePopUp from '../../../components/simpleComponents/SimplePopUp';
import SimpleInput from '../../../components/simpleComponents/SimpleInput';
import Skeleton from '../../../components/simpleComponents/Skeleton';
import TopToolBarSmallScreen from '../../../components/navBars/topToolBarSmallScreen/TopToolBarSmallScreen';
import { getClientNavBarData } from '../../../components/navBars/data/ClientNavBarData';
import PrimaryButton from '../../../components/styledComponents/buttons/PrimaryButton';
import SecondaryButton from '../../../components/styledComponents/buttons/SecondaryButton';
import TertiaryButton from '../../../components/styledComponents/buttons/TertiaryButton';
import SegmentedSwitch from '../../../components/styledComponents/SegmentedSwitch';
import { useScreenSize } from '../../../providers/ScreenSizeProvider';
import { useFromApp } from '../../../providers/FromAppProvider';
import useAutoHttpRequest from '../../../hooks/useAutoHttpRequest';
import clientPortalApi, { CLIENT_PORTAL_REQUEST_OPTIONS } from '../../../api/clientPortalApi';
import signingFilesApi from '../../../api/signingFilesApi';
import filesApi from '../../../api/filesApi';
import { images } from '../../../assets/images/images';
import { ClientMainScreenName, ClientCasesScreenName, ClientDocumentsScreenName, SigningScreenName } from '../../../navigation/screenPaths';
import { clientPortalPath, formatPortalDate, hasPersonalSignature } from '../../../utils/clientPortalNavigation';
import './ClientDocumentsScreen.scss';

export function documentStatus(file) {
    if (file.Source === 'case') return 'caseFile';
    return ['pending', 'waiting', 'signed', 'rejected', 'expired', 'declined', 'cancelled', 'view_only'].includes(file.PersonalStatus)
        ? file.PersonalStatus : 'unavailable';
}

export function filterDocuments(files, tab, query) {
    const search = query.trim().toLocaleLowerCase();
    return files.filter(file => (tab !== 'signed' || hasPersonalSignature(file))
        && (tab !== 'pending' || file.CanSignNow === true)
        && (!search || `${file.FileName || ''} ${file.CaseName || ''}`.toLocaleLowerCase().includes(search)))
        .sort((a, b) => (Date.parse(b.PersonalSignedAt || b.CreatedAt) || 0) - (Date.parse(a.PersonalSignedAt || a.CreatedAt) || 0));
}

function DocumentDetails({ children, title }) {
    const section = useRef(null);
    useEffect(() => {
        const previous = document.activeElement;
        section.current?.querySelector('h2')?.focus();
        return () => { if (previous?.isConnected) previous.focus(); };
    }, []);
    return <section ref={section} className="lw-clientDocumentDetails" aria-label={title}>{children}</section>;
}

export default function ClientDocumentsScreen({ initialTab = 'all' }) {
    const { t, i18n } = useTranslation();
    const { isSmallScreen } = useScreenSize();
    const { isFromApp } = useFromApp();
    const navigate = useNavigate();
    const location = useLocation();
    const [params, setParams] = useSearchParams();
    const requestedTab = params.get('tab') || initialTab;
    const tab = ['all', 'signed', 'pending'].includes(requestedTab) ? requestedTab : initialTab;
    const [query, setQuery] = useState('');
    const [busy, setBusy] = useState(false);
    const busyRef = useRef(false);
    const [actionError, setActionError] = useState(false);
    const mounted = useRef(true);
    const { result, isPerforming, error, performRequest } = useAutoHttpRequest(clientPortalApi.getDocuments);
    const files = result?.files || [];
    const incomplete = Boolean(error || result?.errors?.length);
    const loading = isPerforming || (!result?.files && !error);
    const selectedId = params.get('document');
    const selectedIdRef = useRef(selectedId);
    selectedIdRef.current = selectedId;
    const selected = files.find(file => file.PortalId === selectedId);
    const visible = filterDocuments(files, tab, query);
    const path = (screen, search = '') => clientPortalPath(location.pathname, screen, search);

    useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
    useEffect(() => { setActionError(false); }, [selectedId]);

    const close = () => {
        const next = new URLSearchParams(params); next.delete('document');
        setParams(next, { replace: true });
    };
    const chooseTab = value => {
        const next = new URLSearchParams(params); next.set('tab', value); next.delete('document');
        navigate(path(ClientDocumentsScreenName, `?${next}`));
    };
    const open = file => {
        const next = new URLSearchParams(params); next.set('document', file.PortalId);
        setParams(next);
    };

    async function runAction(file, kind) {
        if (busyRef.current) return;
        busyRef.current = true; setBusy(true); setActionError(false);
        try {
            if (isFromApp && typeof window.ReactNativeWebView?.postMessage !== 'function') throw new Error('bridge');
            if (file.Source === 'package') {
                const response = await clientPortalApi.openPackageDocument(file);
                const url = response?.data?.url;
                // Only the incumbent browser signing route may receive the existing grant.
                if (response?.status !== 200 || !/^\/ViewSignedDocument\/Sign#[A-Za-z0-9_-]{43}$/.test(url || '')) throw new Error('entry');
                if (!mounted.current || selectedIdRef.current !== file.PortalId) return;
                if (isFromApp && window.ReactNativeWebView?.postMessage) {
                    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'OPEN_URL', payload: { url: `${window.location.origin}${url}` } }));
                } else navigate(url);
            } else if (kind === 'sign' && file.CanSignNow === true) {
                navigate(path(SigningScreenName, `?fileId=${encodeURIComponent(file.SigningFileId)}&open=sign`));
            } else {
                const response = file.Source === 'case'
                    ? await filesApi.readStageFile(file.id, CLIENT_PORTAL_REQUEST_OPTIONS)
                    : await signingFilesApi.downloadSignedFile(file.SigningFileId, CLIENT_PORTAL_REQUEST_OPTIONS);
                const url = response?.data?.readUrl || response?.data?.downloadUrl;
                if (response?.status !== 200 || !/^https?:\/\//i.test(url || '')) throw new Error('download');
                if (!mounted.current || selectedIdRef.current !== file.PortalId) return;
                if (isFromApp && window.ReactNativeWebView?.postMessage) {
                    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'DOWNLOAD_FILE', payload: { url, fileName: file.FileName || 'document.pdf' } }));
                } else {
                    const link = document.createElement('a');
                    link.href = url; link.download = file.FileName || 'document.pdf';
                    link.target = '_blank'; link.rel = 'noopener noreferrer';
                    document.body.appendChild(link);
                    try { link.click(); } finally { link.remove(); }
                }
            }
        } catch {
            if (mounted.current && selectedIdRef.current === file.PortalId) setActionError(true);
        } finally {
            busyRef.current = false;
            if (mounted.current) setBusy(false);
        }
    }

    return <SimpleScreen imageBackgroundSource={images.Backgrounds.AppBackground}>
        {isSmallScreen && <TopToolBarSmallScreen LogoNavigate={path(ClientMainScreenName)} GetNavBarData={getClientNavBarData} isClient />}
        <SimpleScrollView>
            <div className="lw-clientDocuments">
                <header className="lw-clientDocuments__header">
                    <div><h1>{t('clientPortal.myDocuments')}</h1><p>{t('clientPortal.documentsIntro')}</p></div>
                    <TertiaryButton onPress={() => navigate(path(ClientMainScreenName))}>{t('clientPortal.backHome')}</TertiaryButton>
                </header>
                <div className="lw-clientDocuments__tools">
                    <SegmentedSwitch value={tab} onChange={chooseTab} ariaLabel={t('clientPortal.documentFilter')}
                        options={['all', 'pending', 'signed'].map(value => ({ value, label: t(`clientPortal.filters.${value}`) }))} />
                    <SimpleInput type="search" title={t('clientPortal.searchDocuments')} aria-label={t('clientPortal.searchDocuments')}
                        value={query} onChange={event => setQuery(event.target.value)} timeToWaitInMilli={0} />
                </div>
                {incomplete && <div className="lw-clientDocuments__notice" role="alert">
                    <p>{t('clientPortal.partialDocuments')}</p>
                    <SecondaryButton onPress={() => performRequest()} isPerforming={isPerforming}>{t('common.retry')}</SecondaryButton>
                </div>}
                {loading ? <div className="lw-clientDocuments__list" aria-busy="true" aria-label={t('common.loading')}>
                    {[1, 2, 3].map(value => <div className="lw-clientDocuments__loading" key={value}><Skeleton width="60%" height={18} /><Skeleton width="35%" height={14} /></div>)}
                </div> : <>
                    <p className="lw-clientDocuments__resultCount" role="status">{t('clientPortal.documentCount', { count: visible.length })}</p>
                    <div className="lw-clientDocuments__list">
                        {visible.map(file => <button className="lw-clientDocuments__row" type="button" key={file.PortalId} onClick={() => open(file)}>
                            {file.PersonalStatus === 'signed' ? <FileCheck2 aria-hidden size={23} /> : <FileText aria-hidden size={23} />}
                            <span className="lw-clientDocuments__rowText">
                                <strong dir="auto">{file.FileName || t('clientPortal.untitledDocument')}</strong>
                                <span className="lw-clientDocuments__metadata"><bdi>{file.CaseName || t('clientPortal.noCase')}</bdi><bdi>{formatPortalDate(file.PersonalSignedAt || file.CreatedAt, i18n.language)}</bdi></span>
                            </span>
                            <span className={`lw-clientDocuments__status is-${documentStatus(file)}`}>{t(`clientPortal.status.${documentStatus(file)}`)}</span>
                            <ArrowLeft className="lw-clientDocuments__arrow" aria-hidden size={18} />
                        </button>)}
                        {!visible.length && <div className="lw-clientDocuments__empty"><FolderOpen aria-hidden size={30} /><h2>{t(query ? 'clientPortal.noSearchResults' : incomplete ? 'clientPortal.documentsTemporarilyUnavailable' : tab === 'signed' ? 'clientPortal.noSignedDocuments' : tab === 'pending' ? 'clientPortal.noReadyDocuments' : 'clientPortal.noDocuments')}</h2>
                            {query && <TertiaryButton onPress={() => setQuery('')}>{t('clientPortal.clearSearch')}</TertiaryButton>}
                        </div>}
                    </div>
                </>}
                {selectedId && !selected && !loading && <div role="alert" className="lw-clientDocuments__notice"><p>{t('clientPortal.documentUnavailable')}</p><SecondaryButton onPress={close}>{t('common.close')}</SecondaryButton></div>}
            </div>
        </SimpleScrollView>
        <SimplePopUp isOpen={Boolean(selected)} onClose={close} className="lw-clientDocumentPopup" role="dialog" aria-modal="true" aria-labelledby="client-document-title">
            {selected && <DocumentDetails key={selected.PortalId} title={selected.FileName}>
                <h2 id="client-document-title" tabIndex={-1} dir="auto">{selected.FileName || t('clientPortal.untitledDocument')}</h2>
                <p className={`lw-clientDocuments__status is-${documentStatus(selected)}`}>{t(`clientPortal.status.${documentStatus(selected)}`)}</p>
                <dl>
                    <div><dt>{t('signing.screen.caseLabel')}</dt><dd dir="auto">{selected.CaseName || t('clientPortal.noCase')}</dd></div>
                    <div><dt>{t('signing.screen.uploadedAtLabel')}</dt><dd><bdi>{formatPortalDate(selected.CreatedAt, i18n.language) || '—'}</bdi></dd></div>
                    {selected.PersonalSignedAt && <div><dt>{t('clientPortal.signedAt')}</dt><dd><bdi>{formatPortalDate(selected.PersonalSignedAt, i18n.language)}</bdi></dd></div>}
                </dl>
                {hasPersonalSignature(selected) && selected.PersonalStatus !== 'signed' && <p>{t('clientPortal.signedEarlierStage')}</p>}
                {selected.PersonalStatus === 'signed' && selected.Status !== 'signed' && selected.IsFinal !== true && <p>{t('clientPortal.personalSignatureComplete')}</p>}
                <div className="lw-clientDocumentDetails__actions">
                    {selected.Source === 'package' ? <PrimaryButton onPress={() => runAction(selected, 'open')} isPerforming={busy}>{t(selected.CanSignNow ? 'clientPortal.continueSigning' : 'clientPortal.viewDocument')}</PrimaryButton> : <>
                        {selected.CanSignNow === true && <PrimaryButton onPress={() => runAction(selected, 'sign')} isPerforming={busy}>{t('clientPortal.continueSigning')}</PrimaryButton>}
                        <SecondaryButton onPress={() => runAction(selected, 'download')} isPerforming={busy}>{t(selected.Source === 'case' ? 'clientPortal.openFile' : selected.Status === 'signed' ? 'signing.screen.downloadSigned' : 'clientPortal.downloadCurrentCopy')}</SecondaryButton>
                    </>}
                    {selected.CaseId && <TertiaryButton onPress={() => navigate(path(ClientCasesScreenName, `?caseId=${encodeURIComponent(selected.CaseId)}`))}>{t('clientPortal.caseStatus')}</TertiaryButton>}
                </div>
                {actionError && <p role="alert">{t('clientPortal.openDocumentError')}</p>}
            </DocumentDetails>}
        </SimplePopUp>
    </SimpleScreen>;
}
