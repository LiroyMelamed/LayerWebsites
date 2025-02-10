import SimpleCard from "../../../components/simpleComponents/SimpleCard";
import SimpleContainer from "../../../components/simpleComponents/SimpleContainer";
import CaseMenuItem from "../../../components/styledComponents/menuItems/CaseMenuItem";
import Separator from "../../../components/styledComponents/separators/Separator";

export default function AllCasesCard({ allCases, reperformAfterSave }) {

    return (
        <SimpleCard style={{ overflow: null }}>

            <SimpleContainer style={{ overflow: null }}>
                {allCases.map((item, index) => (
                    <>
                        {index !== 0 && <Separator />}

                        <CaseMenuItem
                            key={`taggedCase${index}`}
                            fullCase={item}
                            rightTitle={item.CaseName}

                            leftPreFirstLine={"שם חברה"}
                            leftValueFirstLine={item.CompanyName}

                            rightPreSecondLine={"שלב נוכחי"}
                            rightValueSecondLine={item.CurrentStage}

                            leftPreSecondLine={"סוג תיק"}
                            leftValueSecondLine={item.CaseType}

                            openData={getOpenData(allCases, index)}
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
