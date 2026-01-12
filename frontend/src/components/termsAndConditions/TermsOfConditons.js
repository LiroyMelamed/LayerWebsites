import { DateDDMMYY } from "../../functions/date/DateDDMMYY";
import SimpleContainer from "../simpleComponents/SimpleContainer";
import { Text12, Text16, TextBold24, TextBold32 } from "../specializedComponents/text/AllTextKindFile";
import { useTranslation } from "react-i18next";

import "./TermsOfConditons.scss";

export default function TermsOfConditons() {
    const { t } = useTranslation();

    return (
        <SimpleContainer className="lw-terms">
            <TextBold32>{t('terms.title', { appName: 'MelamedLaw' })}</TextBold32>
            <Text12 className="lw-terms__mt8">{t('terms.lastUpdated', { date: DateDDMMYY(new Date()) })}</Text12>
            <Text16 className="lw-terms__mt12">{t('terms.intro', { appName: 'MelamedLaw' })}</Text16>

            <TextBold24 className="lw-terms__mt16">{t('terms.section1.title')}</TextBold24>
            <Text16 className="lw-terms__mt8">{t('terms.section1.body')}</Text16>

            <TextBold24 className="lw-terms__mt16">{t('terms.section2.title')}</TextBold24>
            <Text16 className="lw-terms__mt8" shouldApplyClamping>{t('terms.section2.body')}</Text16>

            <TextBold24 className="lw-terms__mt16">{t('terms.section3.title')}</TextBold24>
            <Text16 className="lw-terms__mt8" shouldApplyClamping>{t('terms.section3.body')}</Text16>

            <TextBold24 className="lw-terms__mt16">{t('terms.section4.title')}</TextBold24>
            <Text16 className="lw-terms__mt8" shouldApplyClamping>{t('terms.section4.body')}</Text16>

            <TextBold24 className="lw-terms__mt16">{t('terms.section5.title')}</TextBold24>
            <Text16 className="lw-terms__mt8" shouldApplyClamping>{t('terms.section5.body')}</Text16>

            <TextBold24 className="lw-terms__mt16">{t('terms.section6.title')}</TextBold24>
            <Text16 className="lw-terms__mt8" shouldApplyClamping>{t('terms.section6.body')}</Text16>

            <TextBold24 className="lw-terms__mt16">{t('terms.section7.title')}</TextBold24>
            <Text16 className="lw-terms__mt8" shouldApplyClamping>{t('terms.section7.body')}</Text16>

            <TextBold24 className="lw-terms__mt16">{t('terms.section8.title')}</TextBold24>
            <Text16 className="lw-terms__mt8" shouldApplyClamping>{t('terms.section8.body', { email: 'Liav@MelamedLaw.co.il' })}</Text16>

        </SimpleContainer>
    );
}