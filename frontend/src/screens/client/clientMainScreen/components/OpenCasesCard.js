import { images } from "../../../../assets/images/images";
import SimpleCard from "../../../../components/simpleComponents/SimpleCard";
import SimpleContainer from "../../../../components/simpleComponents/SimpleContainer";
import { TextBold20 } from "../../../../components/specializedComponents/text/AllTextKindFile";
import DefaultState from "../../../../components/styledComponents/defaultState/DefaultState";
import CaseMenuItem from "../../../../components/styledComponents/menuItems/CaseMenuItem";
import Separator from "../../../../components/styledComponents/separators/Separator";
import { getOpenDataClient } from "../../../allCasesScreen/components/AllCasesCard";

import './OpenCasesCard.scss';

export default function OpenCasesCard({ openCases, style }) {

    if (openCases?.length === 0 || !openCases) {
        return (
            <DefaultState
                content={"אין כרגע תיקים פתוחים"}
                imageClassName="lw-defaultState__image--h156"
                imageSrc={images.Defaults.Cases}
            />
        )
    }

    return (
        <SimpleCard className="lw-openCasesCard">
            <TextBold20>תיקים פתוחים</TextBold20>

            <SimpleContainer className="lw-openCasesCard__list">
                {openCases.map((item, index) => (
                    <>
                        {index !== 0 && <Separator />}

                        <CaseMenuItem
                            key={`case${index}`}
                            fullCase={item}
                            rightTitle={item.CaseName}

                            leftPreFirstLine={"שם חברה"}
                            leftValueFirstLine={item.CompanyName}

                            rightPreSecondLine={"שלב נוכחי"}
                            rightValueSecondLine={item.CurrentStage}

                            leftPreSecondLine={"סוג תיק"}
                            leftValueSecondLine={item.CaseTypeName}

                            openData={getOpenDataClient(openCases, index)}
                            isClient={true}
                        />
                    </>

                ))}
            </SimpleContainer>

        </SimpleCard>
    );
}