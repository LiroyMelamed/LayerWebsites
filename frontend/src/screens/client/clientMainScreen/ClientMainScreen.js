import { FileCheck2, FileText, FolderOpen, PenLine } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import TopToolBarSmallScreen from "../../../components/navBars/topToolBarSmallScreen/TopToolBarSmallScreen";
import { getClientNavBarData } from "../../../components/navBars/data/ClientNavBarData";
import SimpleScrollView from "../../../components/simpleComponents/SimpleScrollView";
import SimpleContainer from "../../../components/simpleComponents/SimpleContainer";
import SimpleScreen from "../../../components/simpleComponents/SimpleScreen";
import Skeleton from "../../../components/simpleComponents/Skeleton";
import PrimaryButton from "../../../components/styledComponents/buttons/PrimaryButton";
import SecondaryButton from "../../../components/styledComponents/buttons/SecondaryButton";
import TertiaryButton from "../../../components/styledComponents/buttons/TertiaryButton";
import RequestLoadError from "../../../components/ui/RequestLoadError";
import StatusNotice from "../../../components/ui/StatusNotice";
import { useScreenSize } from "../../../providers/ScreenSizeProvider";
import useAutoHttpRequest from "../../../hooks/useAutoHttpRequest";
import { ClientCasesScreenName, ClientDocumentsScreenName } from "../../../navigation/screenPaths";
import { clientPortalPath, formatPortalDate, hasPersonalSignature } from "../../../utils/clientPortalNavigation";
import casesApi from "../../../api/casesApi";
import clientPortalApi from "../../../api/clientPortalApi";
import { images } from "../../../assets/images/images";
import "./ClientMainScreen.scss";

export const ClientMainScreenName = "/ClientMainScreen";

const BUTTON_STYLE = { minHeight: "44px", height: "auto", whiteSpace: "normal" };
const LINK_STYLE = { ...BUTTON_STYLE, boxShadow: "none", marginBottom: 0 };
const ACTION_LIMIT = 5;
const RECENT_SIGNED_LIMIT = 3;
const OTHER_DOCUMENT_LIMIT = 3;

function dateTimestamp(value) {
    const time = value ? new Date(value).getTime() : NaN;
    return Number.isFinite(time) ? time : 0;
}

function SectionHeading({ id, title, count, children }) {
    return <div className="lw-clientHome__sectionHeading">
        <div className="lw-clientHome__headingLabel">
            <h2 id={id}>{title}</h2>
            {typeof count === "number" && <span className="lw-clientHome__count">{count}</span>}
        </div>
        {children}
    </div>;
}

function LoadingRows({ label, rows = 2 }) {
    return <div className="lw-clientHome__loading" role="status" aria-label={label}>
        <span className="lw-clientHome__srOnly">{label}</span>
        {Array.from({ length: rows }, (_, index) => <div className="lw-clientHome__loadingRow" key={index} aria-hidden="true">
            <Skeleton width={44} height={44} borderRadius={10} />
            <div><Skeleton width="72%" height={18} /><Skeleton width="48%" height={14} /></div>
        </div>)}
    </div>;
}

export default function ClientMainScreen() {
    const { t, i18n } = useTranslation();
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const { isSmallScreen } = useScreenSize();
    const { result: allCases, isPerforming: isLoadingCases, error: casesError, performRequest: reloadCases } = useAutoHttpRequest(casesApi.getAllCases);
    const { result: signingData, isPerforming: isLoadingFiles, error: filesError, performRequest: reloadFiles } = useAutoHttpRequest(clientPortalApi.getSigningDocuments);

    const cases = Array.isArray(allCases) ? allCases : [];
    const openCases = cases.filter(caseItem => caseItem.IsClosed === false);
    const closedCases = cases.filter(caseItem => caseItem.IsClosed === true);
    const files = Array.isArray(signingData?.files) ? signingData.files : [];
    const hasPartialFiles = Array.isArray(signingData?.errors) && signingData.errors.length > 0;
    const actionableFiles = files.filter(file => file.CanSignNow === true && file.PersonalStatus !== "signed");
    const otherFiles = files.filter(file => file.CanSignNow !== true && file.PersonalStatus !== "signed");
    const signedFiles = files.filter(hasPersonalSignature)
        .sort((left, right) => dateTimestamp(right.PersonalSignedAt) - dateTimestamp(left.PersonalSignedAt));

    const openDocuments = () => navigate(clientPortalPath(pathname, ClientDocumentsScreenName));
    const openSigned = () => navigate(clientPortalPath(pathname, ClientDocumentsScreenName, "?tab=signed"));
    const openCasesPage = () => navigate(clientPortalPath(pathname, ClientCasesScreenName));
    const openFile = file => navigate(clientPortalPath(pathname, ClientDocumentsScreenName, "?document=" + encodeURIComponent(file.PortalId)));
    const fileName = file => file.FileName || t("clientPortal.untitledDocument");
    const otherStatusLabel = file => {
        const statusKeys = {
            pending: "clientPortal.statusPending",
            waiting: "clientPortal.statusWaiting",
            rejected: "clientPortal.statusRejected",
            expired: "clientPortal.statusExpired",
            unavailable: "clientPortal.statusUnavailable",
            view_only: "clientPortal.status.view_only",
            declined: "clientPortal.status.declined",
            cancelled: "clientPortal.status.cancelled",
        };
        return t(statusKeys[file.PersonalStatus] || "clientPortal.statusUnavailable");
    };

    return <SimpleScreen imageBackgroundSource={images.Backgrounds.AppBackground}>
        {isSmallScreen && <TopToolBarSmallScreen LogoNavigate={clientPortalPath(pathname, ClientMainScreenName)} GetNavBarData={getClientNavBarData} isClient={true} />}
        <SimpleScrollView>
            <SimpleContainer className="lw-clientHome">
                <header className="lw-clientHome__greeting">
                    <h1>{t("clientPortal.homeTitle")}</h1>
                    <p>{t("clientPortal.homeIntro")}</p>
                </header>
                <nav className="lw-clientHome__quickAccess" aria-label={t("clientPortal.quickAccess")}>
                    <SecondaryButton style={BUTTON_STYLE} onPress={openDocuments}>{t("clientPortal.myDocuments")}</SecondaryButton>
                </nav>
                <div className="lw-clientHome__overview">
                    <div className="lw-clientHome__mainColumn">
                        <section className="lw-clientHome__panel lw-clientHome__pending" aria-labelledby="client-home-pending">
                            <SectionHeading id="client-home-pending" title={t("clientPortal.actionsTitle")} count={!isLoadingFiles && !filesError && !hasPartialFiles ? actionableFiles.length : undefined} />
                            <p className="lw-clientHome__intro">{t("clientPortal.actionsIntro")}</p>
                            {filesError ? <RequestLoadError onRetry={() => reloadFiles()} /> : isLoadingFiles ? <LoadingRows label={t("clientPortal.loadingDocuments")} /> : <>
                                {hasPartialFiles && <StatusNotice onAction={() => reloadFiles()} actionLabel={t("common.retry")}><p>{t("clientPortal.partialDocumentsError")}</p></StatusNotice>}
                                {actionableFiles.length ? <>
                                    <ul className="lw-clientHome__taskList">
                                        {actionableFiles.slice(0, ACTION_LIMIT).map(file => <li className="lw-clientHome__taskRow" key={file.PortalId}>
                                            <span className="lw-clientHome__icon"><PenLine size={22} strokeWidth={1.7} aria-hidden="true" /></span>
                                            <div className="lw-clientHome__taskCopy">
                                                <h3><bdi>{fileName(file)}</bdi></h3>
                                                <p className="lw-clientHome__fileStatus">{t("clientPortal.waitingForYourSignature")}</p>
                                                {file.CaseName && <p><bdi>{file.CaseName}</bdi></p>}
                                            </div>
                                            <div className="lw-clientHome__taskAction">
                                                <PrimaryButton style={BUTTON_STYLE} onPress={() => openFile(file)} disabled={!file.PortalId} aria-label={t("clientPortal.reviewNamedDocument", { name: fileName(file) })}>{t("clientPortal.reviewAndSign")}</PrimaryButton>
                                            </div>
                                        </li>)}
                                    </ul>
                                    {actionableFiles.length > ACTION_LIMIT && <TertiaryButton style={LINK_STYLE} onPress={openDocuments}>{t("clientPortal.allSigningDocuments")}</TertiaryButton>}
                                    <p className="lw-clientHome__footnote"><FileText size={16} aria-hidden="true" />{t("clientPortal.reviewBeforeSigning")}</p>
                                </> : !hasPartialFiles && <div className="lw-clientHome__empty">
                                    <FileCheck2 size={28} strokeWidth={1.6} aria-hidden="true" />
                                    <h3>{t("clientPortal.noActionsTitle")}</h3>
                                    <p>{t("clientPortal.noActionsBody")}</p>
                                </div>}
                                {otherFiles.length > 0 && <div className="lw-clientHome__otherDocuments">
                                    <h3>{t("clientPortal.otherSigningDocuments")}</h3>
                                    <ul className="lw-clientHome__otherList">{otherFiles.slice(0, OTHER_DOCUMENT_LIMIT).map(file => <li key={file.PortalId}>
                                        <div><p><bdi>{fileName(file)}</bdi></p><span>{otherStatusLabel(file)}</span></div>
                                        <TertiaryButton style={LINK_STYLE} onPress={() => openFile(file)} disabled={!file.PortalId} aria-label={t("clientPortal.viewNamedDocument", { name: fileName(file) })}>{t("clientPortal.viewDocument")}</TertiaryButton>
                                    </li>)}</ul>
                                    {otherFiles.length > OTHER_DOCUMENT_LIMIT && <TertiaryButton style={LINK_STYLE} onPress={openDocuments}>{t("clientPortal.allSigningDocuments")}</TertiaryButton>}
                                </div>}
                            </>}
                        </section>
                        {!filesError && <section className="lw-clientHome__panel lw-clientHome__signed" aria-labelledby="client-home-signed">
                            <SectionHeading id="client-home-signed" title={t("clientPortal.recentSigned")}>
                                <TertiaryButton style={LINK_STYLE} onPress={openSigned}>{t("clientPortal.allSignedDocuments")}</TertiaryButton>
                            </SectionHeading>
                            {isLoadingFiles ? <LoadingRows label={t("clientPortal.loadingSignedDocuments")} rows={1} /> : signedFiles.length ? <ul className="lw-clientHome__signedList">
                                {signedFiles.slice(0, RECENT_SIGNED_LIMIT).map(file => {
                                    const signedDate = formatPortalDate(file.PersonalSignedAt, i18n?.resolvedLanguage || i18n?.language);
                                    return <li key={file.PortalId} className="lw-clientHome__signedRow">
                                        <span className="lw-clientHome__icon lw-clientHome__icon--signed"><FileCheck2 size={22} strokeWidth={1.6} aria-hidden="true" /></span>
                                        <div className="lw-clientHome__signedCopy">
                                            <h3><bdi>{fileName(file)}</bdi></h3>
                                            {file.CaseName && <p><bdi>{file.CaseName}</bdi></p>}
                                            <p>{signedDate ? t("clientPortal.youSignedOn", { date: signedDate }) : t("clientPortal.signedByYou")}</p>
                                            {file.PersonalStatus !== "signed" && <p>{t("clientPortal.signedEarlierStage")}</p>}
                                        </div>
                                        <TertiaryButton style={LINK_STYLE} onPress={() => openFile(file)} disabled={!file.PortalId} aria-label={t("clientPortal.viewNamedDocument", { name: fileName(file) })}>{t("clientPortal.viewDocument")}</TertiaryButton>
                                    </li>;
                                })}
                            </ul> : !hasPartialFiles && <p className="lw-clientHome__emptySigned">{t("clientPortal.noSignedDocuments")}</p>}
                        </section>}
                    </div>
                    <aside className="lw-clientHome__panel lw-clientHome__caseSummary" aria-labelledby="client-home-case-summary">
                        <span className="lw-clientHome__icon"><FolderOpen size={23} strokeWidth={1.6} aria-hidden="true" /></span>
                        <h2 id="client-home-case-summary">{t("clientPortal.caseSummaryTitle")}</h2>
                        <p className="lw-clientHome__intro">{t("clientPortal.caseSummaryIntro")}</p>
                        {casesError ? <RequestLoadError onRetry={() => reloadCases()} /> : isLoadingCases ? <LoadingRows label={t("clientPortal.loadingCases")} rows={1} /> : <dl className="lw-clientHome__caseCounts">
                            <div><dt>{t("cases.openCases")}</dt><dd>{openCases.length}</dd></div>
                            <div><dt>{t("cases.closedCases")}</dt><dd>{closedCases.length}</dd></div>
                        </dl>}
                        <div className="lw-clientHome__caseAction"><TertiaryButton style={LINK_STYLE} onPress={openCasesPage}>{t("clientPortal.allCases")}</TertiaryButton></div>
                    </aside>
                </div>
            </SimpleContainer>
        </SimpleScrollView>
    </SimpleScreen>;
}
