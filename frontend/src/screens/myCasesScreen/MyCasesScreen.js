import { useMemo, useState } from 'react';
import casesApi from '../../api/casesApi';
import { images } from '../../assets/images/images';
import TopToolBarSmallScreen from '../../components/navBars/topToolBarSmallScreen/TopToolBarSmallScreen';
import SimpleContainer from '../../components/simpleComponents/SimpleContainer';
import SimpleLoader from '../../components/simpleComponents/SimpleLoader';
import SimpleScreen from '../../components/simpleComponents/SimpleScreen';
import SimpleScrollView from '../../components/simpleComponents/SimpleScrollView';
import SearchInput from '../../components/specializedComponents/containers/SearchInput';
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

    const { result: myCases, isPerforming: isPerformingMyCases, performRequest: refetchMyCases } = useAutoHttpRequest(casesApi.getMyCases);

    const filtered = useMemo(() => {
        const q = String(query || '').trim().toLowerCase();
        if (!q) return myCases;

        return (myCases || []).filter((c) => {
            const fields = [c?.CaseName, c?.CustomerName, c?.CaseTypeName, c?.CompanyName, c?.CaseId];
            return fields.some((f) => String(f || '').toLowerCase().includes(q));
        });
    }, [myCases, query]);

    if (isPerformingMyCases) {
        return <SimpleLoader />;
    }

    return (
        <SimpleScreen imageBackgroundSource={images.Backgrounds.AppBackground}>
            {isSmallScreen && <TopToolBarSmallScreen chosenNavKey="myCases" LogoNavigate={AdminStackName + MainScreenName} />}

            <SimpleScrollView>
                <SimpleContainer className="lw-myCasesScreen__row">
                    <SearchInput
                        onSearch={setQuery}
                        title={t('cases.searchMyCases')}
                        titleFontSize={20}
                        className="lw-myCasesScreen__search"
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
