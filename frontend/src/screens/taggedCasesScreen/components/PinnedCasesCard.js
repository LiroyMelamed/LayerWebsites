import { images } from "../../../assets/images/images";
import SimpleCard from "../../../components/simpleComponents/SimpleCard";
import SimpleContainer from "../../../components/simpleComponents/SimpleContainer";
import SimpleLoader from "../../../components/simpleComponents/SimpleLoader";
import { TextBold20 } from "../../../components/specializedComponents/text/AllTextKindFile";
import DefaultState from "../../../components/styledComponents/defaultState/DefaultState";
import CaseMenuItem from "../../../components/styledComponents/menuItems/CaseMenuItem";
import Separator from "../../../components/styledComponents/separators/Separator";
import { useTranslation } from "react-i18next";

import './PinnedCasesCard.scss';

export default function PinnedCasesCard({ taggedCases, isPerforming, rePerformFunction }) {
    const { t } = useTranslation();

    if (isPerforming) {
        return (
            <SimpleCard className="lw-pinnedCasesCard">
                <SimpleLoader />
            </SimpleCard>
        )
    }

    if (taggedCases?.length === 0 || !taggedCases) {
        return (
            <DefaultState
                content={t('taggedCases.emptyPinnedCases')}
                imageClassName="lw-defaultState__image--h156"
                imageSrc={images.Defaults.TaggedCase}
            />
        )
    }

    return (
        <SimpleCard className="lw-pinnedCasesCard">
            <TextBold20>{t('taggedCases.pinnedCasesTitle')}</TextBold20>

            <SimpleContainer className="lw-pinnedCasesCard__list">
                {taggedCases.map((item, index) => (
                    <SimpleContainer
                        key={item?.CaseId ?? `taggedCase${index}`}
                        className="lw-pinnedCasesCard__item"
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

                            openData={getOpenData(taggedCases, index, t)}
                            rePerformFunction={rePerformFunction}
                        />
                    </SimpleContainer>
                ))}
            </SimpleContainer>
        </SimpleCard>
    )
}

//Functions
function getOpenData(taggedCases, index, t) {
    const openData = [
        {
            title: t('cases.customerName'),
            value: taggedCases[index].CustomerName
        },
        {
            title: t('cases.customerId'),
            value: taggedCases[index].CostumerTaz
        },
        {
            title: t('cases.phoneNumber'),
            value: taggedCases[index].PhoneNumber
        },
        {
            title: t('taggedCases.pinned'),
            value: taggedCases[index].IsTagged ? t('common.yes') : t('common.no')
        },
    ]

    return openData;
}
