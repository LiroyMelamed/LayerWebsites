import { images } from "../../../assets/images/images";
import SimpleCard from "../../../components/simpleComponents/SimpleCard";
import SimpleContainer from "../../../components/simpleComponents/SimpleContainer";
import SimpleLoader from "../../../components/simpleComponents/SimpleLoader";
import { TextBold20 } from "../../../components/specializedComponents/text/AllTextKindFile";
import DefaultState from "../../../components/styledComponents/defaultState/DefaultState";
import CaseMenuItem from "../../../components/styledComponents/menuItems/CaseMenuItem";
import Separator from "../../../components/styledComponents/separators/Separator";
import { DateDDMMYY } from "../../../functions/date/DateDDMMYY";

import './AllCasesCard.scss';

export default function AllCasesCard({ allCases, isPerforming, reperformAfterSave }) {

    if (isPerforming) {
        return (
            <SimpleCard className="lw-allCasesCard">
                <SimpleLoader />
            </SimpleCard>
        )
    }

    if (allCases?.length === 0 || !allCases) {
        return (
            <DefaultState
                content={"אין כרגע תיקים"}
                imageClassName="lw-defaultState__image--h156"
                imageSrc={images.Defaults.Cases}
            />
        )
    }

    return (
        <SimpleCard className="lw-allCasesCard">
            <TextBold20>כל התיקים</TextBold20>

            <SimpleContainer className="lw-allCasesCard__list">
                {allCases?.map((item, index) => (
                    <>
                        {index !== 0 && <Separator />}

                        <CaseMenuItem
                            key={`case${index}`}
                            fullCase={item}
                            rightTitle={`${item.CaseName} - ${item.CustomerName}`}

                            leftPreFirstLine={"שם חברה"}
                            leftValueFirstLine={item.CompanyName}

                            rightPreSecondLine={"שלב נוכחי"}
                            rightValueSecondLine={item.CurrentStage}

                            leftPreSecondLine={"סוג תיק"}
                            leftValueSecondLine={item.CaseTypeName}

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
export function getOpenData(allCases, index) {
    const caseItem = allCases[index];

    const openData = [
        {
            title: "שם לקוח",
            value: caseItem.CustomerName
        },
        {
            title: "ת.ז לקוח",
            value: caseItem.CostumerTaz
        },
        {
            title: "מספר פלאפון",
            value: caseItem.PhoneNumber
        },
        {
            title: "נעוץ",
            value: caseItem.IsTagged ? "כן" : "לא"
        },
        {
            title: "תאריך סיום משוער",
            value: DateDDMMYY(caseItem.EstimatedCompletionDate) || 'לא צויין'
        },
        {
            title: "תוקף רישיון",
            value: DateDDMMYY(caseItem.LicenseExpiryDate) || 'לא צויין'
        },
    ];

    return openData;
}

export function getOpenDataClient(taggedCases, index) {
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
            title: "מנהל תיק",
            value: taggedCases[index].CaseManager
        },
    ]

    return openData;
}
