import { useMemo, useState } from 'react';
import casesApi, { casesTypeApi } from '../../api/casesApi';
import { images } from '../../assets/images/images';
import TopToolBarSmallScreen from '../../components/navBars/topToolBarSmallScreen/TopToolBarSmallScreen';
import SimpleContainer from '../../components/simpleComponents/SimpleContainer';
import SimpleLoader from '../../components/simpleComponents/SimpleLoader';
import SimpleScreen from '../../components/simpleComponents/SimpleScreen';
import SimpleScrollView from '../../components/simpleComponents/SimpleScrollView';
import SearchInput from '../../components/specializedComponents/containers/SearchInput';
import ChooseButton from '../../components/styledComponents/buttons/ChooseButton';
import FilterSearchInput from '../../components/specializedComponents/containers/FilterSearchInput';
import useAutoHttpRequest from '../../hooks/useAutoHttpRequest';
import { AdminStackName } from '../../navigation/AdminStack';
import { useScreenSize } from '../../providers/ScreenSizeProvider';
import { MainScreenName } from '../mainScreen/MainScreen';
import AllCasesCard from '../allCasesScreen/components/AllCasesCard';
import { useTranslation } from 'react-i18next';

import './MyCasesScreen.scss';

export const MyCasesScreenName = '/MyCases';

export default function MyCasesScreen() {
    const { t } = useTranslation();
    const { isSmallScreen } = useScreenSize();

    const [query, setQuery] = useState('');
    const [selectedClient, setSelectedClient] = useState(null);
    const [selectedManager, setSelectedManager] = useState(null);
    const [selectedStatus, setSelectedStatus] = useState(null);

    const { result: myCases, isPerforming: isPerformingMyCases, performRequest: refetchMyCases } = useAutoHttpRequest(casesApi.getMyCases);
    const { result: allCasesTypes, isPerforming: isPerformingAllCasesTypes } = useAutoHttpRequest(casesTypeApi.getAllCasesTypeForFilter);
    const [selectedCaseType, setSelectedCaseType] = useState(null);

    const filtered = useMemo(() => {
        let list = myCases || [];

        const q = String(query || '').trim().toLowerCase();
        if (q) {
            list = list.filter((c) => {
                const fields = [c?.CaseName, c?.CustomerName, c?.CaseTypeName, c?.CompanyName, c?.CaseId];
                return fields.some((f) => String(f || '').toLowerCase().includes(q));
            });
        }

        if (selectedCaseType) {
            list = list.filter(item => item.CaseTypeName === selectedCaseType);
        }

        if (selectedStatus === 'open') {
            list = list.filter(item => item.IsClosed === false);
        } else if (selectedStatus === 'closed') {
            list = list.filter(item => item.IsClosed === true);
        }

        if (selectedClient) {
            list = list.filter(item => {
                if (Array.isArray(item.Users) && item.Users.length > 0) {
                    return item.Users.some(u => u.Name === selectedClient);
                }
                return item.CustomerName === selectedClient;
            });
        }

        if (selectedManager) {
            list = list.filter(item => item.CaseManager === selectedManager);
        }

        return list;
    }, [myCases, query, selectedCaseType, selectedStatus, selectedClient, selectedManager]);

    const clientNames = [...new Set((myCases || []).flatMap(c => {
        if (Array.isArray(c.Users) && c.Users.length > 0) return c.Users.map(u => u.Name);
        return [c.CustomerName];
    }).filter(Boolean))].sort();
    const managerNames = [...new Set((myCases || []).map(c => c.CaseManager).filter(Boolean))].sort();

    if (isPerformingMyCases || isPerformingAllCasesTypes) {
        return <SimpleLoader />;
    }

    return (
        <SimpleScreen imageBackgroundSource={images.Backgrounds.AppBackground}>
            {isSmallScreen && <TopToolBarSmallScreen chosenNavKey="myCases" LogoNavigate={AdminStackName + MainScreenName} />}

            <SimpleScrollView>
                <SimpleContainer className="lw-myCasesScreen__topRow">
                    <SearchInput
                        onSearch={setQuery}
                        title={t('cases.searchMyCases')}
                        titleFontSize={20}
                        className="lw-myCasesScreen__search"
                    />

                    <FilterSearchInput
                        items={clientNames}
                        placeholder={t('cases.customerName')}
                        titleFontSize={20}
                        onSelect={setSelectedClient}
                        className="lw-myCasesScreen__clientFilter"
                    />
                </SimpleContainer>

                <SimpleContainer className="lw-myCasesScreen__filtersRow">
                    <ChooseButton
                        buttonText={t('cases.statusFilter')}
                        items={[
                            { value: 'closed', label: t('cases.closedCases') },
                            { value: 'open', label: t('cases.openCases') },
                        ]}
                        className="lw-myCasesScreen__choose"
                        OnPressChoiceFunction={setSelectedStatus}
                    />

                    <ChooseButton
                        buttonText={t('cases.caseType')}
                        items={(allCasesTypes || []).map((ct) => ({ value: ct, label: ct }))}
                        className="lw-myCasesScreen__choose"
                        OnPressChoiceFunction={setSelectedCaseType}
                    />

                    <ChooseButton
                        buttonText={t('cases.caseManager')}
                        items={managerNames.map((name) => ({ value: name, label: name }))}
                        className="lw-myCasesScreen__choose"
                        OnPressChoiceFunction={setSelectedManager}
                    />
                </SimpleContainer>

                <AllCasesCard
                    title={t('cases.myCasesTitle')}
                    allCases={filtered || []}
                    isPerforming={false}
                    reperformAfterSave={refetchMyCases}
                />
            </SimpleScrollView>
        </SimpleScreen>
    );
}
