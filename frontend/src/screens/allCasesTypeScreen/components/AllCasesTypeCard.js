import { images } from "../../../assets/images/images";
import SimpleCard from "../../../components/simpleComponents/SimpleCard";
import SimpleContainer from "../../../components/simpleComponents/SimpleContainer";
import Skeleton from "../../../components/simpleComponents/Skeleton";
import DefaultState from "../../../components/styledComponents/defaultState/DefaultState";
import CaseTypeMenuItem from "../../../components/styledComponents/menuItems/CaseTypeMenuItem";
import Separator from "../../../components/styledComponents/separators/Separator";
import { useTranslation } from 'react-i18next';
import formatListPageTitle from '../../../functions/i18n/formatListPageTitle';
import ListPageTitle from '../../../components/specializedComponents/text/ListPageTitle';

import './AllCasesTypeCard.scss';

export default function AllCasesTypeCard({ allCasesType, reperformAfterSave, isPerforming }) {
    const { t } = useTranslation();
    const pageTitle = t('nav.allCaseTypes');
    const itemCount = allCasesType?.length ?? 0;

    if (isPerforming) {
        return (
            <SimpleCard className="lw-allCasesTypeCard">
                {[1, 2, 3].map(i => (
                    <SimpleContainer key={i} style={{ padding: '0.75rem 0' }}>
                        {i !== 1 && <Separator />}
                        <Skeleton width="50%" height={14} />
                        <SimpleContainer style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                            <Skeleton width="30%" height={12} />
                            <Skeleton width="20%" height={12} />
                        </SimpleContainer>
                    </SimpleContainer>
                ))}
            </SimpleCard>
        )
    }

    if (allCasesType?.length === 0 || !allCasesType) {
        return (
            <SimpleCard className="lw-allCasesTypeCard">
                <ListPageTitle title={pageTitle} count={0} />
                <DefaultState
                    content={t('cases.noCaseTypes')}
                    imageClassName="lw-defaultState__image--h156"
                    imageSrc={images.Defaults.Cases}
                />
            </SimpleCard>
        )
    }

    return (
        <SimpleCard className="lw-allCasesTypeCard">
            <ListPageTitle title={pageTitle} count={itemCount} />

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
