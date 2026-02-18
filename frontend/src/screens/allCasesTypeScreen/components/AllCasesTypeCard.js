import { images } from "../../../assets/images/images";
import SimpleCard from "../../../components/simpleComponents/SimpleCard";
import SimpleContainer from "../../../components/simpleComponents/SimpleContainer";
import SimpleLoader from "../../../components/simpleComponents/SimpleLoader";
import DefaultState from "../../../components/styledComponents/defaultState/DefaultState";
import CaseTypeMenuItem from "../../../components/styledComponents/menuItems/CaseTypeMenuItem";
import Separator from "../../../components/styledComponents/separators/Separator";
import { useTranslation } from 'react-i18next';

import './AllCasesTypeCard.scss';

export default function AllCasesTypeCard({ allCasesType, reperformAfterSave, isPerforming }) {
    const { t } = useTranslation();

    if (isPerforming) {
        return (
            <SimpleCard className="lw-allCasesTypeCard">
                <SimpleLoader />
            </SimpleCard>
        )
    }

    if (allCasesType?.length === 0 || !allCasesType) {
        return (
            <DefaultState
                content={t('cases.noCaseTypes')}
                imageClassName="lw-defaultState__image--h156"
                imageSrc={images.Defaults.Cases}
            />
        )
    }

    return (
        <SimpleCard className="lw-allCasesTypeCard">

            <SimpleContainer className="lw-allCasesTypeCard__list">
                {allCasesType.map((item, index) => (
                    <SimpleContainer
                        key={item?.CaseTypeId ?? `caseType${index}`}
                        className="lw-allCasesTypeCard__item"
                    >
                        {index !== 0 && <Separator />}

                        <CaseTypeMenuItem
                            fullCase={item}

                            leftPreFirstLine={t('cases.caseType')}
                            leftValueFirstLine={item.CaseTypeName}

                            rightPreSecondLine={t('cases.stageCount')}
                            rightValueSecondLine={item.NumberOfStages}

                            leftPreSecondLine={null}
                            leftValueSecondLine={item.CaseType}

                            rePerformFunction={reperformAfterSave}
                        />
                    </SimpleContainer>
                ))}
            </SimpleContainer>
        </SimpleCard>
    )
}
