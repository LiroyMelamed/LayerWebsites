import { images } from "../../../assets/images/images";
import SimpleCard from "../../../components/simpleComponents/SimpleCard";
import SimpleContainer from "../../../components/simpleComponents/SimpleContainer";
import SimpleLoader from "../../../components/simpleComponents/SimpleLoader";
import { TextBold20 } from "../../../components/specializedComponents/text/AllTextKindFile";
import DefaultState from "../../../components/styledComponents/defaultState/DefaultState";
import CaseMenuItem from "../../../components/styledComponents/menuItems/CaseMenuItem";
import Separator from "../../../components/styledComponents/separators/Separator";

import './PinnedCasesCard.scss';

export default function PinnedCasesCard({ taggedCases, isPerforming, rePerformFunction }) {

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
                content={"אין כרגע תיקים נעוצים"}
                imageClassName="lw-defaultState__image--h156"
                imageSrc={images.Defaults.TaggedCase}
            />
        )
    }

    return (
        <SimpleCard className="lw-pinnedCasesCard">
            <TextBold20>תיקים נעוצים</TextBold20>

            <SimpleContainer className="lw-pinnedCasesCard__list">
                {taggedCases.map((item, index) => (
                    <>
                        {index != 0 && <Separator />}

                        <CaseMenuItem
                            key={`taggedCase${index}`}
                            fullCase={item}
                            rightTitle={`${item.CaseName} - ${item.CustomerName}`}

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
