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
import { useTranslation } from "react-i18next";

import "./MainScreen.scss";

export const MainScreenName = "/MainScreen";

export default function MainScreen() {
    const { t } = useTranslation();
    const navigate = useNavigate()
    const { isSmallScreen } = useScreenSize();
    const { result: mainScreenData, isPerforming: isPerformingMainScreenData, performRequest } = useAutoHttpRequest(casesApi.getMainScreenData);

    if (isPerformingMainScreenData) {
        return <SimpleLoader />;
    }

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
                    />
                </SimpleContainer>

                <SimpleContainer className="lw-mainScreen__cards">
                    <SimpleContainer className="lw-mainScreen__row">
                        <ShowDataCard
                            numberText={mainScreenData?.AllCasesData?.length}
                            title={t("mainScreen.totalCases")}
                            optionalOnClick={() => { navigate(AdminStackName + AllCasesScreenName) }}
                        />

                        <ShowDataCard
                            numberText={mainScreenData?.NumberOfClosedCases}
                            title={t("cases.closedCases")}
                            optionalOnClick={() => { navigate(AdminStackName + AllCasesScreenName) }}
                        />
                    </SimpleContainer>

                    <SimpleContainer className="lw-mainScreen__row lw-mainScreen__row--wrap">
                        <ShowDataCard
                            numberText={mainScreenData?.NumberOfTaggedCases}
                            title={t("mainScreen.taggedCases")}
                            optionalOnClick={() => { navigate(AdminStackName + TaggedCasesScreenName) }}
                        />
                        <ShowDataCard
                            numberText={mainScreenData?.ActiveCustomers?.length}
                            title={t("mainScreen.activeCustomers")}
                        />
                    </SimpleContainer>

                </SimpleContainer>

                <ClientsCard
                    customerList={mainScreenData?.AllCustomersData}
                    rePerformRequest={performRequest}
                />
            </SimpleScrollView>

        </SimpleScreen >
    );
}
