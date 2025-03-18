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
        console.log(descriptions);

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
        <SimpleContainer style={{ ...style, ...styles.container }}>
            <SimpleScrollView>
                <SimpleContainer style={styles.rowStyle}>
                    <SimpleInput
                        style={styles.inputStyle}
                        title={"שם סוג התיק"}
                        value={caseTypeName}
                        onChange={(e) => setCaseTypeName(e.target.value)}
                        error={caseTypeNameError}
                    />
                    <SimpleInput
                        style={styles.inputStyle}
                        title={"מספר שלבים"}
                        value={numberOfStages}
                        onChange={(e) => setNumberOfStages(Number(e.target.value))}
                        error={numberOfStagesError}
                    />
                </SimpleContainer>

                {descriptions.map((description, index) => (
                    <SimpleTextArea
                        key={index}
                        title={`תיאור מס' ${index + 1}`}
                        value={description.Text || ""}
                        style={{ marginTop: index != 0 ? 8 : 0 }}
                        onChange={(text) => {
                            setDescriptions((prev) => {
                                const updatedDescriptions = [...prev];
                                updatedDescriptions[index].Text = text;
                                return updatedDescriptions;
                            });
                        }}
                    />
                ))}

                <SimpleContainer style={styles.buttonsRowStyle}>
                    {caseTypeDetails && (
                        <SecondaryButton
                            onPress={handleDeleteCaseType}
                            isPerforming={isDeleting}
                            style={styles.button}
                        >
                            {isDeleting ? "מוחק..." : "מחק סוג תיק"}
                        </SecondaryButton>
                    )}
                    <PrimaryButton
                        onPress={handleSaveCaseType}
                        isPerforming={isPerforming}
                        style={styles.button}
                        disabled={hasError}
                    >
                        {isPerforming ? "שומר..." : caseTypeDetails ? "עדכן סוג תיק" : "שמור סוג תיק"}
                    </PrimaryButton>
                    <SecondaryButton
                        onPress={handleAddStage}
                        style={styles.button}
                    >
                        הוסף שלב
                    </SecondaryButton>
                </SimpleContainer>
            </SimpleScrollView>
        </SimpleContainer>
    );
}

const styles = {
    container: {
        width: "100%",
        margin: "0 auto",
    },
    rowStyle: {
        display: "flex",
        flexDirection: "row-reverse",
        marginBottom: "16px",
        flexWrap: "wrap",
    },
    inputStyle: {
        flex: 1,
        minWidth: "150px",
    },
    buttonsRowStyle: {
        display: "flex",
        flexDirection: "row",
        justifyContent: "center",
        marginBottom: "16px",
        marginTop: "16px",
        flexWrap: "wrap",
    },
    button: {
        margin: "8px 8px",
    },
};
