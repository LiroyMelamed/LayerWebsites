import { useMemo, useState } from 'react';
import SimpleScreen from '../../components/simpleComponents/SimpleScreen';
import SimpleScrollView from '../../components/simpleComponents/SimpleScrollView';
import { useScreenSize } from '../../providers/ScreenSizeProvider';
import useAutoHttpRequest from '../../hooks/useAutoHttpRequest';
import { images } from '../../assets/images/images';
import SimpleContainer from '../../components/simpleComponents/SimpleContainer';
import ChooseButton from '../../components/styledComponents/buttons/ChooseButton';
import FilterSearchInput from '../../components/specializedComponents/containers/FilterSearchInput';
import PrimaryButton from '../../components/styledComponents/buttons/PrimaryButton';
import TopToolBarSmallScreen from '../../components/navBars/topToolBarSmallScreen/TopToolBarSmallScreen';
import PinnedCasesCard from './components/PinnedCasesCard';
import { usePopup } from '../../providers/PopUpProvider';
import TagCasePopup from './components/TagCasePopup';
import casesApi, { casesTypeApi } from '../../api/casesApi';
import { MainScreenName } from '../mainScreen/MainScreen';
import { AdminStackName } from '../../navigation/AdminStack';
import { useTranslation } from 'react-i18next';

import "./TaggedCasesScreen.scss";

export const TaggedCasesScreenName = "/TaggedCasesScreen";

export default function TaggedCasesScreen() {
    const { t } = useTranslation();
    const { openPopup, closePopup } = usePopup();
    const { isSmallScreen } = useScreenSize();

    const [selectedCaseType, setSelectedCaseType] = useState(null);
    const [selectedStatus, setSelectedStatus] = useState('open');
    const [selectedClient, setSelectedClient] = useState(null);
    const [selectedManager, setSelectedManager] = useState(null);
    const [selectedCompany, setSelectedCompany] = useState(null);
    const [selectedCaseName, setSelectedCaseName] = useState(null);

    const { result: taggedCases, isPerforming: isPerformingTaggedCases, performRequest } = useAutoHttpRequest(casesApi.getAllTaggedCases);

    const { result: allCasesTypes } = useAutoHttpRequest(casesTypeApi.getAllCasesTypeForFilter);

    const displayTaggedCases = useMemo(() => {
        if (!Array.isArray(taggedCases)) return [];

        let filtered = taggedCases;

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

        if (selectedCompany) {
            filtered = filtered.filter(item =>
                item.CompanyName && item.CompanyName.toLowerCase().includes(selectedCompany.toLowerCase())
            );
        }

        return filtered;
    }, [
        taggedCases,
        selectedCaseName,
        selectedCaseType,
        selectedStatus,
        selectedClient,
        selectedManager,
        selectedCompany,
    ]);

    const caseNames = [...new Set((taggedCases || []).map(c => c.CaseName).filter(Boolean))].sort();
    const clientNames = [...new Set((taggedCases || []).flatMap(c => {
        if (Array.isArray(c.Users) && c.Users.length > 0) return c.Users.map(u => u.Name);
        return [c.CustomerName];
    }).filter(Boolean))].sort();
    const managerNames = [...new Set((taggedCases || []).map(c => c.CaseManager).filter(Boolean))].sort();
    const companyNames = [...new Set((taggedCases || []).map(c => c.CompanyName).filter(Boolean))].sort();

    return (
        <SimpleScreen imageBackgroundSource={images.Backgrounds.AppBackground}>
            {isSmallScreen && <TopToolBarSmallScreen chosenNavKey="pinnedCases" LogoNavigate={AdminStackName + MainScreenName} />}

            <SimpleScrollView>
                <SimpleContainer className="lw-taggedCasesScreen__filtersRow">
                    <ChooseButton
                        buttonText={t('cases.statusFilter')}
                        items={[
                            { value: 'closed', label: t('cases.closedCases') },
                            { value: 'open', label: t('cases.openCases') },
                        ]}
                        className="lw-taggedCasesScreen__choose"
                        OnPressChoiceFunction={setSelectedStatus}
                        defaultValue={'open'}
                    />

                    <ChooseButton
                        buttonText={t('cases.caseType')}
                        items={(allCasesTypes || []).map((ct) => ({ value: ct, label: ct }))}
                        className="lw-taggedCasesScreen__choose"
                        OnPressChoiceFunction={setSelectedCaseType}
                    />

                    <ChooseButton
                        buttonText={t('cases.caseManager')}
                        items={managerNames.map((name) => ({ value: name, label: name }))}
                        className="lw-taggedCasesScreen__choose"
                        OnPressChoiceFunction={setSelectedManager}
                    />
                </SimpleContainer>

                <SimpleContainer className="lw-taggedCasesScreen__topRow">
                    <FilterSearchInput
                        items={caseNames}
                        placeholder={t('taggedCases.searchPinnedCaseTitle')}
                        titleFontSize={20}
                        onSelect={setSelectedCaseName}
                        className="lw-taggedCasesScreen__search"
                    />

                    <FilterSearchInput
                        items={clientNames}
                        placeholder={t('cases.customerName')}
                        titleFontSize={20}
                        onSelect={setSelectedClient}
                        className="lw-taggedCasesScreen__clientFilter"
                    />

                    <FilterSearchInput
                        items={companyNames}
                        placeholder={t('cases.companyName')}
                        titleFontSize={20}
                        onSelect={setSelectedCompany}
                        className="lw-taggedCasesScreen__companyFilter"
                    />
                </SimpleContainer>

                <PinnedCasesCard
                    taggedCases={displayTaggedCases}
                    rePerformFunction={performRequest}
                    isPerforming={isPerformingTaggedCases}
                />
            </SimpleScrollView>

            <SimpleContainer className="lw-taggedCasesScreen__footer">
                <PrimaryButton
                    onPress={() => openPopup(<TagCasePopup rePerformRequest={() => { performRequest(); closePopup(); }} />)}
                >
                    {t('taggedCases.pinCase')}
                </PrimaryButton>
            </SimpleContainer>
        </SimpleScreen>
    );
}
