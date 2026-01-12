import { images } from "../../../../assets/images/images";
import SimpleCard from "../../../../components/simpleComponents/SimpleCard";
import SimpleContainer from "../../../../components/simpleComponents/SimpleContainer";
import { TextBold20 } from "../../../../components/specializedComponents/text/AllTextKindFile";
import DefaultState from "../../../../components/styledComponents/defaultState/DefaultState";
import CaseMenuItem from "../../../../components/styledComponents/menuItems/CaseMenuItem";
import Separator from "../../../../components/styledComponents/separators/Separator";
import { getOpenData } from "../../../allCasesScreen/components/AllCasesCard";
import { useTranslation } from 'react-i18next';

import './ClosedCasesCard.scss';

export default function ClosedCasesCard({ closedCases, reperformAfterSave, style: _style, className }) {
    const { t } = useTranslation();

    if (closedCases?.length === 0 || !closedCases) {
        return (
            <DefaultState
                content={t('cases.noClosedCases')}
                imageClassName="lw-defaultState__image--h156"
                imageSrc={images.Defaults.Cases}
                className={className}
            />
        )
    }

    return (
        <SimpleCard className={["lw-closedCasesCard", className].filter(Boolean).join(' ')}>
            <TextBold20>{t('cases.closedCases')}</TextBold20>

            <SimpleContainer className="lw-closedCasesCard__list">
                {closedCases.map((item, index) => (
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

                            openData={getOpenData(closedCases, index, t)}
                            isClient={true}
                        />
                    </>

                ))}
            </SimpleContainer>

        </SimpleCard>
    );
}