import { useEffect, useState } from "react";
import SimpleContainer from "../../../components/simpleComponents/SimpleContainer";
import SimpleInput from "../../../components/simpleComponents/SimpleInput";
import SimpleScrollView from "../../../components/simpleComponents/SimpleScrollView";
import SecondaryButton from "../../../components/styledComponents/buttons/SecondaryButton";
import { casesTypeApi } from "../../../api/casesApi";
import useHttpRequest from "../../../hooks/useHttpRequest";
import PrimaryButton from "../../../components/styledComponents/buttons/PrimaryButton";
import SimpleTextArea from "../../../components/simpleComponents/SimpleTextArea";

export default function CaseTypeFullView({ caseTypeDetails, rePerformRequest, onFailureFunction, closePopUpFunction, style }) {
    const [caseType, setCaseType] = useState({
        CaseTypeName: "",
        NumberOfStages: "",
        Descriptions: [{ Stage: 1, Text: "", Timestamp: "", New: false }],
    });

    useEffect(() => {
        if (caseTypeDetails) {
            setCaseType({
                CaseTypeName: caseTypeDetails.CaseTypeName,
                NumberOfStages: caseTypeDetails.NumberOfStages.toString(),
                Descriptions: caseTypeDetails.Descriptions || [{ Stage: 1, Text: "", Timestamp: "", New: false }],
            });
        }
    }, [caseTypeDetails]);

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

    const handleInputChange = (field, value) => {
        setCaseType((prev) => ({ ...prev, [field]: value }));
    };

    const handleSaveCaseType = () => {
        if (!caseType.CaseTypeName || !caseType.NumberOfStages) {
            alert("Please provide both case type name and number of stages.");
            return;
        }

        const apiCall = caseTypeDetails
            ? performRequest(caseTypeDetails.CaseTypeId, caseType)
            : performRequest(caseType);

        apiCall.finally(() => closePopUpFunction?.());
    };

    const handleDeleteCaseType = () => {
        deleteCaseType(caseTypeDetails.CaseTypeId);
    };

    const handleAddStage = () => {
        setCaseType((prev) => {
            const newStage = prev.Descriptions.length + 1;
            return {
                ...prev,
                NumberOfStages: newStage.toString(),
                Descriptions: [...prev.Descriptions, { Stage: newStage, Text: "", Timestamp: "", New: false }],
            };
        });
    };

    useEffect(() => {
        setCaseType((prevDetails) => {
            const currentStages = prevDetails.Descriptions.length;
            const targetStages = Number(prevDetails.NumberOfStages);

            if (targetStages > currentStages) {
                // Add new stages without modifying existing ones
                const newStages = Array.from({ length: targetStages - currentStages }, (_, index) => ({
                    Stage: currentStages + index + 1,
                    Text: '',
                    Timestamp: '',
                    New: false,
                }));

                return {
                    ...prevDetails,
                    Descriptions: [...prevDetails.Descriptions, ...newStages],
                };
            } else if (targetStages < currentStages) {
                return {
                    ...prevDetails,
                    Descriptions: prevDetails.Descriptions.slice(0, targetStages),
                };
            }

            return prevDetails;
        });
    }, [caseType.NumberOfStages]);


    return (
        <SimpleContainer style={{ ...style, ...styles.container }}>
            <SimpleScrollView>
                <SimpleContainer style={styles.rowStyle}>
                    <SimpleInput
                        style={styles.inputStyle}
                        title={"שם סוג התיק"}
                        value={caseType.CaseTypeName}
                        onChange={(e) => handleInputChange("CaseTypeName", e.target.value)}
                    />
                    <SimpleInput
                        style={styles.inputStyle}
                        title={"מספר שלבים"}
                        value={caseType.NumberOfStages}
                        onChange={(e) => handleInputChange("NumberOfStages", e.target.value)}
                    />
                </SimpleContainer>

                {caseType.Descriptions.map((description, index) => (
                    <SimpleTextArea
                        key={index}
                        title={`תיאור מס' ${index + 1}`}
                        value={description.Text || ""}
                        style={{ marginTop: index != 0 ? 8 : 0 }}
                        onChange={(text) => {
                            setCaseType((prev) => {
                                const updatedDescriptions = [...prev.Descriptions];
                                updatedDescriptions[index].Text = text;
                                return { ...prev, Descriptions: updatedDescriptions };
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
