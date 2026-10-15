import React from 'react';
import OfficeIntegrations from './OfficeIntegrations';
import SimpleScreen from '../../components/simpleComponents/SimpleScreen';
import SimpleScrollView from '../../components/simpleComponents/SimpleScrollView';
import TopToolBarSmallScreen from '../../components/navBars/topToolBarSmallScreen/TopToolBarSmallScreen';
import { getNavBarData } from '../../components/navBars/data/NavBarData';
import { useScreenSize } from '../../providers/ScreenSizeProvider';
import { useOfficeLogoNavigate } from '../../navigation/useOfficeLogoNavigate';
import { images } from '../../assets/images/images';

export default function OfficeIntegrationsScreen() {
    const { isSmallScreen } = useScreenSize();
    const logoNavigate = useOfficeLogoNavigate();
    return <SimpleScreen imageBackgroundSource={images.Backgrounds.AppBackground}>
        {isSmallScreen && <TopToolBarSmallScreen chosenNavKey="officeIntegrations" LogoNavigate={logoNavigate} GetNavBarData={getNavBarData} />}
        <SimpleScrollView><OfficeIntegrations /></SimpleScrollView>
    </SimpleScreen>;
}
