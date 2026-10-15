import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import casesApi, { casesTypeApi } from "../../api/casesApi";
import { images } from "../../assets/images/images";
import TopToolBarSmallScreen from "../../components/navBars/topToolBarSmallScreen/TopToolBarSmallScreen";
import SimpleContainer from "../../components/simpleComponents/SimpleContainer";
import SimpleScreen from "../../components/simpleComponents/SimpleScreen";
import SimpleScrollView from "../../components/simpleComponents/SimpleScrollView";
import ChooseButton from "../../components/styledComponents/buttons/ChooseButton";
import FilterSearchInput from "../../components/specializedComponents/containers/FilterSearchInput";

import useAutoHttpRequest from "../../hooks/useAutoHttpRequest";
import { AdminStackName } from "../../navigation/AdminStack";

import { useScreenSize } from "../../providers/ScreenSizeProvider";
import { MainScreenName } from "../mainScreen/MainScreen";
import AllCasesCard from "./components/AllCasesCard";
import { useTranslation } from "react-i18next";
import { usePopup } from "../../providers/PopUpProvider";
import CaseFullView from "../../components/styledComponents/cases/CaseFullView";


import "./AllCasesScreen.scss";

export const AllCasesScreenName = "/AllCasesScreen";

export default function AllCasesScreen() {
    const { t } = useTranslation();
    const [searchParams, setSearchParams] = useSearchParams();
    const statusParam = searchParams.get('status');
    const initialStatus = statusParam === 'closed' ? 'closed' : statusParam === 'all' ? 'all' : 'open';
    const deepCaseId = String(searchParams.get('caseId') || '').trim();
    const initialManager = searchParams.get('manager') || null;
    const initialUnassigned = searchParams.get('unassigned') === '1';
    const deepLinkHandledRef = useRef(false);

    const { isSmallScreen } = useScreenSize();
    const { openPopup, closePopup } = usePopup();
    const [selectedCaseType, setSelectedCaseType] = useState(null);
    const [selectedStatus, setSelectedStatus] = useState(initialStatus);
    const [selectedClient, setSelectedClient] = useState(null);
    const [selectedManager, setSelectedManager] = useState(initialManager);
    const [selectedUnassigned, setSelectedUnassigned] = useState(initialUnassigned);
    const [selectedCompany, setSelectedCompany] = useState(null);
    const [selectedCaseName, setSelectedCaseName] = useState(null);

    const { result: allCasesTypes } = useAutoHttpRequest(casesTypeApi.getAllCasesTypeForFilter);
    const { result: allCases, isPerforming: isPerformingAllCases, performRequest: reperformAfterSave } = useAutoHttpRequest(casesApi.getAllCases);

    const clearDeepCaseId = useCallback(() => {
        if (!searchParams.has('caseId')) return;
        const next = new URLSearchParams(searchParams);
        next.delete('caseId');
        setSearchParams(next, { replace: true });
    }, [searchParams, setSearchParams]);

    useEffect(() => {
        if (!deepCaseId || deepLinkHandledRef.current) return;
        let cancelled = false;

        (async () => {
            try {
                const res = await casesApi.getCaseById(deepCaseId);
                const caseDetails = res?.data ?? res;
                if (cancelled || !caseDetails || (!caseDetails.CaseId && !caseDetails.caseid)) return;
                deepLinkHandledRef.current = true;
                openPopup(
                    <CaseFullView
                        caseDetails={caseDetails}
                        rePerformRequest={reperformAfterSave}
                        closePopUpFunction={closePopup}
                    />
                );
                clearDeepCaseId();
            } catch (err) {
                console.error('Failed to open case from deep link', err);
                deepLinkHandledRef.current = true;
                clearDeepCaseId();
            }
        })();

        return () => { cancelled = true; };
    }, [deepCaseId, openPopup, closePopup, reperformAfterSave, clearDeepCaseId]);

    useEffect(() => {
        const managerParam = searchParams.get('manager');
        const unassigned = searchParams.get('unassigned') === '1';
        const statusParam = searchParams.get('status');

        setSelectedManager(managerParam ? decodeURIComponent(managerParam) : null);
        setSelectedUnassigned(unassigned);
        if (statusParam === 'closed' || statusParam === 'open' || statusParam === 'all') {
            setSelectedStatus(statusParam);
        } else if (managerParam || unassigned) {
            setSelectedStatus('open');
        }
    }, [searchParams]);

    const displayCases = useMemo(() => {
        if (!Array.isArray(allCases)) return [];

        let filtered = allCases;

        if (selectedCaseName) {
            filtered = filtered.filter(item =>
                item.CaseName && item.CaseName.toLowerCase().includes(selectedCaseName.toLowerCase())
            );
        }

        if (selectedCaseType) {
            filtered = filtered.filter(item => item.CaseTypeName === selectedCaseType);
        }

        if (selectedStatus === "open") {
            filtered = filtered.filter(item => item.IsClosed === false);
        } else if (selectedStatus === "closed") {
            filtered = filtered.filter(item => item.IsClosed === true);
        }
        // "all" — no open/closed filter

        if (selectedClient) {
            const q = selectedClient.toLowerCase();
            filtered = filtered.filter(item => {
                if (Array.isArray(item.Users) && item.Users.length > 0) {
                    return item.Users.some(u => u.Name && u.Name.toLowerCase().includes(q));
                }
                return item.CustomerName && item.CustomerName.toLowerCase().includes(q);
            });
        }

        if (selectedManager) {
            filtered = filtered.filter(item => item.CaseManager === selectedManager);
        }

        if (selectedUnassigned) {
            filtered = filtered.filter(item => !item.CaseManager);
        }

        if (selectedCompany) {
            filtered = filtered.filter(item =>
                item.CompanyName && item.CompanyName.toLowerCase().includes(selectedCompany.toLowerCase())
            );
        }

        return filtered;
    }, [
        allCases,
        selectedCaseName,
        selectedCaseType,
        selectedStatus,
        selectedClient,
        selectedManager,
        selectedUnassigned,
        selectedCompany,
    ]);

    const handleFilterByCaseName = (caseName) => {
        setSelectedCaseName(caseName);
    };

    const handleFilterByType = (type) => {
        setSelectedCaseType(type);
    };

    const handleFilterByStatus = (status) => {
        setSelectedStatus(status);
    };

    const handleFilterByClient = (client) => {
        setSelectedClient(client);
    };

    const handleFilterByManager = (manager) => {
        setSelectedManager(manager);
        setSelectedUnassigned(false);
    };

    const handleFilterByCompany = (company) => {
        setSelectedCompany(company);
    };

    const caseNames = [...new Set((allCases || []).map(c => c.CaseName).filter(Boolean))].sort();
    const clientNames = [...new Set((allCases || []).flatMap(c => {
        if (Array.isArray(c.Users) && c.Users.length > 0) return c.Users.map(u => u.Name);
        return [c.CustomerName];
    }).filter(Boolean))].sort();
    const managerNames = [...new Set((allCases || []).map(c => c.CaseManager).filter(Boolean))].sort();
    const companyNames = [...new Set((allCases || []).map(c => c.CompanyName).filter(Boolean))].sort();

    return (
        <SimpleScreen imageBackgroundSource={images.Backgrounds.AppBackground}>
            {isSmallScreen && <TopToolBarSmallScreen chosenNavKey="allCases" LogoNavigate={AdminStackName + MainScreenName} />}

            <SimpleScrollView>
                <SimpleContainer className="lw-allCasesScreen__filtersRow">
                    <ChooseButton
                        buttonText={t('cases.statusFilter')}
                        items={[
                            { value: 'all', label: t('cases.allCasesFilter') },
                            { value: 'open', label: t('cases.openCases') },
                            { value: 'closed', label: t('cases.closedCases') },
                        ]}
                        defaultValue={selectedStatus}
                        className="lw-allCasesScreen__choose lw-allCasesScreen__choose--openClose"
                        OnPressChoiceFunction={handleFilterByStatus}
                    />

                    <ChooseButton
                        buttonText={t('cases.caseType')}
                        items={(allCasesTypes || []).map((ct) => ({ value: ct, label: ct }))}
                        className="lw-allCasesScreen__choose"
                        OnPressChoiceFunction={handleFilterByType}
                    />

                    <ChooseButton
                        buttonText={
                            selectedUnassigned
                                ? t('managerHome.summary.unassigned')
                                : t('cases.caseManager')
                        }
                        items={managerNames.map((name) => ({ value: name, label: name }))}
                        defaultValue={selectedUnassigned ? null : selectedManager}
                        className="lw-allCasesScreen__choose"
                        OnPressChoiceFunction={handleFilterByManager}
                    />
                </SimpleContainer>

                <SimpleContainer className="lw-allCasesScreen__topRow">
                    <FilterSearchInput
                        items={caseNames}
                        placeholder={t('cases.searchCaseTitle')}
                        titleFontSize={20}
                        onSelect={handleFilterByCaseName}
                        className="lw-allCasesScreen__search"
                    />

                    <FilterSearchInput
                        items={clientNames}
                        placeholder={t('cases.customerName')}
                        titleFontSize={20}
                        onSelect={handleFilterByClient}
                        className="lw-allCasesScreen__clientFilter"
                    />

                    <FilterSearchInput
                        items={companyNames}
                        placeholder={t('cases.companyName')}
                        titleFontSize={20}
                        onSelect={handleFilterByCompany}
                        className="lw-allCasesScreen__companyFilter"
                    />
                </SimpleContainer>

                <AllCasesCard
                    allCases={displayCases}
                    reperformAfterSave={reperformAfterSave}
                    isPerforming={isPerformingAllCases}
                />
            </SimpleScrollView>


        </SimpleScreen>
    )
}
