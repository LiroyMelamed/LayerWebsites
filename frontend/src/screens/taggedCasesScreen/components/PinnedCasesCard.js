import { images } from "../../../assets/images/images";
import SimpleCard from "../../../components/simpleComponents/SimpleCard";
import SimpleContainer from "../../../components/simpleComponents/SimpleContainer";
import { TextBold20 } from "../../../components/specializedComponents/text/AllTextKindFile";
import DefaultState from "../../../components/styledComponents/defaultState/DefaultState";
import CaseMenuItem from "../../../components/styledComponents/menuItems/CaseMenuItem";
import Separator from "../../../components/styledComponents/separators/Separator";

export default function PinnedCasesCard({ taggedCases, rePerformFunction }) {
    if (taggedCases?.length === 0 || !taggedCases) {
        return (
            <DefaultState
                content={"אין כרגע תיקים נעוצים"}
                imageStyle={{ height: 156 }}
                imageSrc={images.Defaults.TaggedCase}
                style={{ width: null }}
            />
        )
    }

    return (
        <SimpleCard style={{ overflow: null, flexDirection: 'column' }}>
            <TextBold20>תיקים נעוצים</TextBold20>

            <SimpleContainer style={{ overflow: null, flexDirection: 'column', marginTop: 16 }}>
                {taggedCases.map((item, index) => (
                    <>
                        {index != 0 && <Separator />}

                        <CaseMenuItem
                            key={`taggedCase${index}`}
                            fullCase={item}
                            rightTitle={item.CaseName}

                            leftPreFirstLine={"שם חברה"}
                            leftValueFirstLine={item.CompanyName}

                            rightPreSecondLine={"שלב נוכחי"}
                            rightValueSecondLine={item.CurrentStage}

                            leftPreSecondLine={"סוג תיק"}
                            leftValueSecondLine={item.CaseTypeName}

                            openData={getOpenData(taggedCases, index)}
                            rePerformFunction={rePerformFunction}
                        />
                    </>

                ))}
            </SimpleContainer>
        </SimpleCard>
    )
}

//Functions
function getOpenData(taggedCases, index) {
    const openData = [
        {
            title: "שם לקוח",
            value: taggedCases[index].CustomerName
        },
        {
            title: "ת.ז לקוח",
            value: taggedCases[index].CostumerTaz
        },
        {
            title: "מספר פלאפון",
            value: taggedCases[index].PhoneNumber
        },
        {
            title: "נעוץ",
            value: taggedCases[index].IsTagged ? "כן" : "לא"
        },
    ]

    return openData;
}
