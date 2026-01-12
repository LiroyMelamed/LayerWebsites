import { images } from "../../../../assets/images/images";
import SimpleCard from "../../../../components/simpleComponents/SimpleCard";
import SimpleContainer from "../../../../components/simpleComponents/SimpleContainer";
import { TextBold20 } from "../../../../components/specializedComponents/text/AllTextKindFile";
import DefaultState from "../../../../components/styledComponents/defaultState/DefaultState";
import CaseMenuItem from "../../../../components/styledComponents/menuItems/CaseMenuItem";
import Separator from "../../../../components/styledComponents/separators/Separator";
import { getOpenDataClient } from "../../../allCasesScreen/components/AllCasesCard";
import { useTranslation } from 'react-i18next';

import './OpenCasesCard.scss';

export default function OpenCasesCard({ openCases, style }) {
    const { t } = useTranslation();

    if (openCases?.length === 0 || !openCases) {
        return (
            <DefaultState
                content={t('cases.noOpenCases')}
                imageClassName="lw-defaultState__image--h156"
                imageSrc={images.Defaults.Cases}
            />
        )
    }

    return (
        <SimpleCard className="lw-openCasesCard">
            <TextBold20>{t('cases.openCases')}</TextBold20>

            <SimpleContainer className="lw-openCasesCard__list">
                {openCases.map((item, index) => (
                    <>
                        {index !== 0 && <Separator />}

                        <CaseMenuItem
                            key={`case${index}`}
                            fullCase={item}
                            rightTitle={item.CaseName}

                            leftPreFirstLine={t('cases.caseType')}
                            leftValueFirstLine={item.CaseTypeName}

                            rightPreSecondLine={t('cases.currentStage')}
                            rightValueSecondLine={item.IsClosed ? t('cases.ended') : item.CurrentStage}

                            leftPreSecondLine={""}
                            leftValueSecondLine={""}

                            openData={getOpenDataClient(openCases, index, t)}
                            isClient={true}
                        />
                    </>

                ))}
            </SimpleContainer>

        </SimpleCard>
    );
}