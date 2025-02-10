import SimpleCard from "../../../components/simpleComponents/SimpleCard";
import SimpleContainer from "../../../components/simpleComponents/SimpleContainer";
import CaseMenuItem from "../../../components/styledComponents/menuItems/CaseMenuItem";
import CaseTypeMenuItem from "../../../components/styledComponents/menuItems/CaseTypeMenuItem";
import Separator from "../../../components/styledComponents/separators/Separator";

export default function AllCasesTypeCard({ allCasesType, reperformAfterSave }) {

    return (
        <SimpleCard style={{ overflow: null }}>

            <SimpleContainer style={{ overflow: null }}>
                {allCasesType.map((item, index) => (
                    <>
                        {index !== 0 && <Separator />}

                        <CaseTypeMenuItem
                            key={`taggedCase${index}`}
                            fullCase={item}
                            rightTitle={item.CaseName}

                            leftPreFirstLine={"סוג תיק"}
                            leftValueFirstLine={item.CaseTypeName}

                            rightPreSecondLine={"מספר שלבים"}
                            rightValueSecondLine={item.NumberOfStages}

                            leftPreSecondLine={null}
                            leftValueSecondLine={item.CaseType}

                            openData={getOpenData(allCasesType, index)}
                            rePerformFunction={reperformAfterSave}
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
