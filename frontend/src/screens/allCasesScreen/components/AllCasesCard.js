import { images } from "../../../assets/images/images";
import SimpleCard from "../../../components/simpleComponents/SimpleCard";
import SimpleContainer from "../../../components/simpleComponents/SimpleContainer";
import SimpleLoader from "../../../components/simpleComponents/SimpleLoader";
import { TextBold20 } from "../../../components/specializedComponents/text/AllTextKindFile";
import DefaultState from "../../../components/styledComponents/defaultState/DefaultState";
import CaseMenuItem from "../../../components/styledComponents/menuItems/CaseMenuItem";
import Separator from "../../../components/styledComponents/separators/Separator";
import { DateDDMMYY } from "../../../functions/date/DateDDMMYY";
import { useTranslation } from 'react-i18next';
import i18next from 'i18next';

import './AllCasesCard.scss';

export default function AllCasesCard({ allCases, isPerforming, reperformAfterSave, title }) {
    const { t } = useTranslation();
    const cardTitle = String(title || '').trim() || t('cases.allCases');

    if (isPerforming) {
        return (
            <SimpleCard className="lw-allCasesCard">
                <SimpleLoader />
            </SimpleCard>
        )
    }

    if (allCases?.length === 0 || !allCases) {
        return (
            <DefaultState
                content={t('cases.noCases')}
                imageClassName="lw-defaultState__image--h156"
                imageSrc={images.Defaults.Cases}
            />
        )
    }

    return (
        <SimpleCard className="lw-allCasesCard">
            <TextBold20>{cardTitle}</TextBold20>

            <SimpleContainer className="lw-allCasesCard__list">
                {allCases?.map((item, index) => (
                    <SimpleContainer
                        key={item?.CaseId ?? index}
                        className="lw-allCasesCard__item"
                    >
                        {index !== 0 && <Separator />}

                        <CaseMenuItem
                            fullCase={item}
                            rightTitle={`${item.CaseName} - ${item.CustomerName}`}

                            leftPreFirstLine={t('cases.caseType')}
                            leftValueFirstLine={item.CaseTypeName}

                            rightPreSecondLine={t('cases.currentStage')}
                            rightValueSecondLine={item.IsClosed ? t('cases.ended') : item.CurrentStage}

                            leftPreSecondLine={""}
                            leftValueSecondLine={""}

                            openData={getOpenData(allCases, index, t)}
                            rePerformFunction={reperformAfterSave}
                        />
                    </SimpleContainer>

                ))}
            </SimpleContainer>
        </SimpleCard>
    )
}

//Functions
export function getOpenData(allCases, index, t) {
    const caseItem = allCases[index];
    const translate = t ?? i18next.t.bind(i18next);

    const openData = [
        {
            title: translate('cases.customerName'),
            value: caseItem.CustomerName
        },
        {
            title: translate('cases.phoneNumber'),
            value: caseItem.PhoneNumber
        },
        {
            title: translate('taggedCases.pinned'),
            value: caseItem.IsTagged ? translate('common.yes') : translate('common.no')
        },
        {
            title: translate('cases.estimatedCompletionDate'),
            value: DateDDMMYY(caseItem.EstimatedCompletionDate) || null
        },
        {
            title: translate('cases.licenseExpiryDate'),
            value: DateDDMMYY(caseItem.LicenseExpiryDate) || null
        },
    ].filter(row => row.value != null && row.value !== '');

    return openData;
}

export function getOpenDataClient(taggedCases, index, t) {
    const translate = t ?? i18next.t.bind(i18next);

    const openData = [
        {
            title: translate('cases.customerName'),
            value: taggedCases[index].CustomerName
        },
        {
            title: translate('cases.phoneNumber'),
            value: taggedCases[index].PhoneNumber
        },
        {
            title: translate('cases.caseManager'),
            value: taggedCases[index].CaseManager
        },
    ].filter(row => row.value != null && row.value !== '');

    return openData;
}
