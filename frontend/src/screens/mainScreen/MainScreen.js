import React from 'react';
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

export const MainScreenName = "/MainScreen";

export default function MainScreen() {
    const { isSmallScreen } = useScreenSize();
    const { result: mainScreenData, isPerforming: isPerformingMainScreenData, performRequest } = useAutoHttpRequest(casesApi.getMainScreenData);

    if (isPerformingMainScreenData) {
        return <SimpleLoader />;
    }

    return (
        <SimpleScreen style={styles.screenStyle(isSmallScreen)} imageBackgroundSource={images.Backgrounds.AppBackground}>
            {isSmallScreen && <TopToolBarSmallScreen LogoNavigate={AdminStackName + MainScreenName} />}

            <SimpleContainer style={{ display: 'flex', flexDirection: 'row-reverse', flexWrap: 'wrap' }}>
                <SimpleContainer style={{ display: 'flex', flexDirection: 'row-reverse', flex: 1 }}>
                    <ComprasionDataCard
                        colors={colors.doughnutChartColorScale}
                        labels={['תיקים פתוחים', 'תיקים סגורים']}
                        data={[mainScreenData?.AllCasesData?.length - mainScreenData?.NumberOfClosedCases, mainScreenData?.NumberOfClosedCases]}
                        title={"סכימת תיקים"}
                        centerText={`${mainScreenData?.AllCasesData?.length}`}
                        subText='סה"כ תיקים'
                        style={{ width: '100%' }}
                    />
                </SimpleContainer>
                <SimpleContainer style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                    <SimpleContainer style={{ display: 'flex', flexDirection: 'row-reverse', }}>
                        <ShowDataCard
                            numberText={mainScreenData?.AllCasesData?.length}
                            title={'סה"כ תיקים'}
                        />

                        <ShowDataCard
                            numberText={mainScreenData?.NumberOfClosedCases}
                            title={"תיקים סגורים"}
                        />
                    </SimpleContainer>

                    <SimpleContainer style={{ display: 'flex', flexWrap: 'wrap', flexDirection: 'row-reverse', }}>
                        <ShowDataCard
                            numberText={mainScreenData?.NumberOfTaggedCases}
                            title={"תיקים מתוייגים"}
                        />
                        <ShowDataCard
                            numberText={mainScreenData?.AllCustomersData?.length}
                            title={"לקוחות פעילים"}
                        />
                    </SimpleContainer>
                </SimpleContainer>

            </SimpleContainer>

            <SimpleContainer style={{ display: 'flex', height: '100%' }}>
                <ClientsCard
                    style={{ width: '100%', }}
                    customerList={mainScreenData?.AllCustomersData}
                    rePerformRequest={performRequest}
                />
            </SimpleContainer>

        </SimpleScreen >
    );
}

const styles = {
    screenStyle: () => ({
        boxSizing: 'border-box',
        flexDirection: 'column',
    }),
    responsiveContainer: {
        display: 'flex',
        flexDirection: 'row-reverse',
        alignItems: 'center',
        flexWrap: 'wrap',
        maxWidth: '100%',
        overflow: 'hidden',
    },
    searchInput: {
        margin: "12px 0px",
        marginLeft: 20,
        flex: '1 1 200px',
        maxWidth: '500px',
    },
    chooseButton: {
        margin: "12px 0px",
        flex: '0 1 auto',
        minWidth: '100px',
    }
};
