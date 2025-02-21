import { images } from "../../../../assets/images/images";
import SimpleCard from "../../../../components/simpleComponents/SimpleCard";
import SimpleContainer from "../../../../components/simpleComponents/SimpleContainer";
import { TextBold20 } from "../../../../components/specializedComponents/text/AllTextKindFile";
import DefaultState from "../../../../components/styledComponents/defaultState/DefaultState";
import CaseMenuItem from "../../../../components/styledComponents/menuItems/CaseMenuItem";
import Separator from "../../../../components/styledComponents/separators/Separator";
import { getOpenData } from "../../../allCasesScreen/components/AllCasesCard";

export default function ClosedCasesCard({ closedCases, reperformAfterSave, style }) {

    if (closedCases?.length === 0 || !closedCases) {
        return (
            <DefaultState
                content={"אין כרגע תיקים סגורים"}
                imageStyle={{ height: 156 }}
                imageSrc={images.Defaults.Cases}
                style={{ ...style, width: null }}
            />
        )
    }

    return (
        <SimpleCard style={{ ...style, overflow: null, flexDirection: 'column' }}>
            <TextBold20>תיקים סגורים</TextBold20>

            <SimpleContainer style={{ overflow: null, flexDirection: 'column', marginTop: 16 }}>
                {closedCases.map((item, index) => (
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

                            openData={getOpenData(closedCases, index)}
                            isClient={true}
                        />
                    </>

                ))}
            </SimpleContainer>

        </SimpleCard>
    );
}