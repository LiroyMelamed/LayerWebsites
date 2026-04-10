import { useRef } from 'react';
import SimpleScreen from '../../components/simpleComponents/SimpleScreen';
import { useScreenSize } from '../../providers/ScreenSizeProvider';
import useAutoHttpRequest from '../../hooks/useAutoHttpRequest';
import { images } from '../../assets/images/images';
import SimpleLoader from '../../components/simpleComponents/SimpleLoader';
import SimpleContainer from '../../components/simpleComponents/SimpleContainer';
import TopToolBarSmallScreen from '../../components/navBars/topToolBarSmallScreen/TopToolBarSmallScreen';
import ShowDataCard from './components/ShowDataCard';
import ComprasionDataCard from './components/ComprasionDataCard';
import { colors } from '../../constant/colors';
import ClientsCard from './components/ClientsCard';
import casesApi from '../../api/casesApi';
import { AdminStackName } from '../../navigation/AdminStack';
import SimpleScrollView from '../../components/simpleComponents/SimpleScrollView';
import { useNavigate } from 'react-router-dom';
import { TaggedCasesScreenName } from '../taggedCasesScreen/TaggedCasesScreen';
import { AllCasesScreenName } from '../allCasesScreen/AllCasesScreen';
import { AllClientsScreenName } from '../allClientsScreen/AllClientsScreen';
import { useTranslation } from "react-i18next";
import { useDemoMode, DEMO_ADMIN_DATA } from '../../hooks/useDemoMode';

import "./MainScreen.scss";

export const MainScreenName = "/MainScreen";

export default function MainScreen() {
    const { t } = useTranslation();
    const navigate = useNavigate()
    const { isSmallScreen } = useScreenSize();
    const isDemo = useDemoMode();
    const { result: liveData, isPerforming: isPerformingLive, performRequest } = useAutoHttpRequest(isDemo ? async () => ({ status: 200, data: null }) : casesApi.getMainScreenData);
    const mainScreenData = isDemo ? DEMO_ADMIN_DATA : liveData;
    const isPerformingMainScreenData = isDemo ? false : isPerformingLive;
    const clientsCardRef = useRef(null);

    return (
        <SimpleScreen imageBackgroundSource={images.Backgrounds.AppBackground}>
            {isSmallScreen && <TopToolBarSmallScreen LogoNavigate={AdminStackName + MainScreenName} />}

            <SimpleScrollView>
                <SimpleContainer className="lw-mainScreen__chartWrap">
                    <ComprasionDataCard
                        colors={colors.doughnutChartColorScale}
                        labels={[t("cases.openCases"), t("cases.closedCases")]}
                        data={[mainScreenData?.AllCasesData?.length - mainScreenData?.NumberOfClosedCases, mainScreenData?.NumberOfClosedCases]}
                        title={t("mainScreen.caseSummary")}
                        centerText={`${mainScreenData?.AllCasesData?.length}`}
                        subText={t("mainScreen.totalCases")}
                        className="lw-mainScreen__comparisonCard"
                        onPress={() => { navigate(AdminStackName + AllCasesScreenName + '?status=open') }}
                        isPerforming={isPerformingMainScreenData}
                    />
                </SimpleContainer>

                <SimpleContainer className="lw-mainScreen__cards">
                    <SimpleContainer className="lw-mainScreen__row">
                        <ShowDataCard
                            numberText={mainScreenData?.AllCasesData?.length - mainScreenData?.NumberOfClosedCases}
                            title={t("cases.openCases")}
                            optionalOnClick={() => { navigate(AdminStackName + AllCasesScreenName + '?status=open') }}
                            isPerforming={isPerformingMainScreenData}
                        />

                        <ShowDataCard
                            numberText={mainScreenData?.NumberOfClosedCases}
                            title={t("cases.closedCases")}
                            optionalOnClick={() => { navigate(AdminStackName + AllCasesScreenName + '?status=closed') }}
                            isPerforming={isPerformingMainScreenData}
                        />
                    </SimpleContainer>

                    <SimpleContainer className="lw-mainScreen__row lw-mainScreen__row--wrap">
                        <ShowDataCard
                            numberText={mainScreenData?.NumberOfTaggedCases}
                            title={t("mainScreen.taggedCases")}
                            optionalOnClick={() => { navigate(AdminStackName + TaggedCasesScreenName) }}
                            isPerforming={isPerformingMainScreenData}
                        />
                        <ShowDataCard
                            numberText={mainScreenData?.ActiveCustomers?.length}
                            title={t("mainScreen.activeCustomers")}
                            optionalOnClick={() => { navigate(AdminStackName + AllClientsScreenName) }}
                            isPerforming={isPerformingMainScreenData}
                        />
                    </SimpleContainer>

                </SimpleContainer>

                <ClientsCard
                    ref={clientsCardRef}
                    customerList={mainScreenData?.AllCustomersData}
                    rePerformRequest={performRequest}
                    isPerforming={isPerformingMainScreenData}
                />
            </SimpleScrollView>

        </SimpleScreen >
    );
}
