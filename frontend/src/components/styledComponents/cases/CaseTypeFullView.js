import { NumberOfStagesValidation } from "../../../functions/validation/NumberOfStagesValidation";
import SecondaryButton from "../../../components/styledComponents/buttons/SecondaryButton";
import HebrewCharsValidation from "../../../functions/validation/HebrewCharsValidation";
import PrimaryButton from "../../../components/styledComponents/buttons/PrimaryButton";
import SimpleScrollView from "../../../components/simpleComponents/SimpleScrollView";
import SimpleContainer from "../../../components/simpleComponents/SimpleContainer";
import SimpleTextArea from "../../../components/simpleComponents/SimpleTextArea";
import SimpleInput from "../../../components/simpleComponents/SimpleInput";
import useHttpRequest from "../../../hooks/useHttpRequest";
import useFieldState from "../../../hooks/useFieldState";
import { casesTypeApi } from "../../../api/casesApi";
import { useEffect, useState } from "react";

import "./CaseTypeFullView.scss";

export default function CaseTypeFullView({ caseTypeDetails, rePerformRequest, onFailureFunction, closePopUpFunction, style }) {
    const [caseTypeName, setCaseTypeName, caseTypeNameError] = useFieldState(HebrewCharsValidation, caseTypeDetails?.CaseTypeName || "");
    const [numberOfStages, setNumberOfStages, numberOfStagesError] = useFieldState(NumberOfStagesValidation, caseTypeDetails?.NumberOfStages || "");
    const [descriptions, setDescriptions] = useState(caseTypeDetails?.Descriptions || [{ Stage: 1, Text: "", Timestamp: "", New: false }]);

    const [hasError, setHasError] = useState(false);

    useEffect(() => {
        if (!caseTypeName || !numberOfStages || caseTypeNameError || numberOfStagesError) {
            setHasError(true);
        } else {
            setHasError(false);
        }
    }, [caseTypeName, numberOfStages, caseTypeNameError, numberOfStagesError]);

    const { isPerforming, performRequest } = useHttpRequest(
        caseTypeDetails ? casesTypeApi.updateCaseTypeById : casesTypeApi.addCaseType,
        () => {
            closePopUpFunction?.();
            rePerformRequest?.();
        },
        onFailureFunction
    );

    const { isPerforming: isDeleting, performRequest: deleteCaseType } = useHttpRequest(
        casesTypeApi.deleteCaseTypeById,
        () => {
            closePopUpFunction?.();
            rePerformRequest?.();
        },
        onFailureFunction
    );

    const handleSaveCaseType = () => {
        if (!caseTypeName || !numberOfStages) {
            return;
        }

        const caseTypeToSend = {
            CaseTypeName: caseTypeName,
            NumberOfStages: numberOfStages,
            Descriptions: descriptions || [{ Stage: 1, Text: "", Timestamp: "", New: false }],
        }

        const apiCall = caseTypeDetails
            ? performRequest(Number(caseTypeDetails.CaseTypeId), caseTypeToSend)
            : performRequest(caseTypeToSend);

        apiCall.finally(() => closePopUpFunction?.());
    };

    const handleDeleteCaseType = () => {
        deleteCaseType(caseTypeDetails.CaseTypeId);
    };

    const handleAddStage = () => {
        setNumberOfStages(prev => prev + 1);

        setDescriptions((prev) => {
            const newStage = prev.length + 1;
            return [...prev, { Stage: newStage, Text: "", Timestamp: "", New: false }];
        });
    };

    useEffect(() => {
        if (!numberOfStagesError && numberOfStages) {
            setDescriptions((prevDescriptions) => {
                const currentStages = prevDescriptions.length;

                if (numberOfStages > currentStages) {
                    const newStages = Array.from({ length: numberOfStages - currentStages }, (_, index) => ({
                        Stage: currentStages + index + 1,
                        Text: '',
                        Timestamp: '',
                        New: false,
                    }));

                    return [...prevDescriptions, ...newStages];
                } else if (numberOfStages < currentStages) {
                    return [...prevDescriptions.slice(0, numberOfStages)];
                }

                return prevDescriptions;
            });
        }
    }, [numberOfStages]);


    return (
        <SimpleContainer className="lw-caseTypeFullView" style={style}>
            <SimpleScrollView>
                <SimpleContainer className="lw-caseTypeFullView__row">
                    <SimpleContainer className="lw-caseTypeFullView__inputWrap">
                    <SimpleInput
                        title={"שם סוג התיק"}
                        value={caseTypeName}
                        onChange={(e) => setCaseTypeName(e.target.value)}
                        error={caseTypeNameError}
                    />
                    </SimpleContainer>
                    <SimpleContainer className="lw-caseTypeFullView__inputWrap">
                    <SimpleInput
                        title={"מספר שלבים"}
                        value={numberOfStages}
                        onChange={(e) => setNumberOfStages(Number(e.target.value))}
                        error={numberOfStagesError}
                    />
                    </SimpleContainer>
                </SimpleContainer>

                {descriptions.map((description, index) => (
                    <SimpleContainer key={index} className="lw-caseTypeFullView__textAreaRow">
                        <SimpleTextArea
                            title={`תיאור מס' ${index + 1}`}
                            value={description.Text || ""}
                            onChange={(text) => {
                                setDescriptions((prev) => {
                                    const updatedDescriptions = [...prev];
                                    updatedDescriptions[index].Text = text;
                                    return updatedDescriptions;
                                });
                            }}
                        />
                    </SimpleContainer>
                ))}

                <SimpleContainer className="lw-caseTypeFullView__buttonsRow">
                    {caseTypeDetails && (
                        <SecondaryButton
                            onPress={handleDeleteCaseType}
                            isPerforming={isDeleting}
                        >
                            {isDeleting ? "מוחק..." : "מחק סוג תיק"}
                        </SecondaryButton>
                    )}
                    <PrimaryButton
                        onPress={handleSaveCaseType}
                        isPerforming={isPerforming}
                        disabled={hasError}
                    >
                        {isPerforming ? "שומר..." : caseTypeDetails ? "עדכן סוג תיק" : "שמור סוג תיק"}
                    </PrimaryButton>
                    <SecondaryButton
                        onPress={handleAddStage}
                    >
                        הוסף שלב
                    </SecondaryButton>
                </SimpleContainer>
            </SimpleScrollView>
        </SimpleContainer>
    );
}
