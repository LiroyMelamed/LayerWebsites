import { useEffect, useState } from "react";
import SimpleContainer from "../../../components/simpleComponents/SimpleContainer";
import SimpleInput from "../../../components/simpleComponents/SimpleInput";
import SimpleScrollView from "../../../components/simpleComponents/SimpleScrollView";
import SecondaryButton from "../../../components/styledComponents/buttons/SecondaryButton";
import { buttonSizes } from "../../../styles/buttons/buttonSizes";
import { casesTypeApi } from "../../../api/casesApi";
import useHttpRequest from "../../../hooks/useHttpRequest";
import PrimaryButton from "../../../components/styledComponents/buttons/PrimaryButton";
import SimpleTextArea from "../../../components/simpleComponents/SimpleTextArea";
import SimpleLoader from "../../../components/simpleComponents/SimpleLoader";

export default function CaseTypeFullView({ caseTypeName, rePerformRequest, onFailureFunction, closePopUpFunction, style }) {
    const [caseTypeDetails, setCaseTypeDetails] = useState({
        CaseTypeName: "",
        NumberOfStages: "",
        Descriptions: [{ Stage: 1, Text: "", Timestamp: "", New: false }],
    });

    useEffect(() => {
        if (caseTypeName) {
            fetchCaseTypeDetails(caseTypeName);
        }
    }, [caseTypeName]);

    const { isPerforming: isFetching, performRequest: fetchCaseTypeDetails } = useHttpRequest(
        casesTypeApi.getCaseTypeByName,
        (fetchedData) => {
            if (fetchedData?.length > 0) {
                const data = fetchedData[0];
                setCaseTypeDetails({
                    CaseTypeName: data.CaseTypeName || "",
                    NumberOfStages: data.NumberOfStages || "1",
                    Descriptions: data.Descriptions || [{ Stage: 1, Text: "", Timestamp: "", New: false }],
                });
            }
        },
        onFailureFunction
    );

    const { isPerforming: isSaving, performRequest: saveCaseType } = useHttpRequest(
        casesTypeApi.createOrUpdateCaseType,
        () => {
            alert("Case type saved successfully!");
            rePerformRequest?.();
        },
        onFailureFunction
    );

    const { isPerforming: isDeleting, performRequest: deleteCaseType } = useHttpRequest(
        casesTypeApi.deleteCaseType,
        () => {
            alert("Case type deleted successfully!");
            rePerformRequest?.();
            closePopUpFunction?.();
        },
        onFailureFunction
    );

    const handleInputChange = (field, value) => {
        setCaseTypeDetails((prev) => ({ ...prev, [field]: value }));
    };

    const handleSaveCaseType = () => {
        if (!caseTypeDetails.CaseTypeName || !caseTypeDetails.NumberOfStages) {
            alert("Please provide both case type name and number of stages.");
            return;
        }
        saveCaseType(caseTypeDetails.CaseTypeName, caseTypeDetails);
    };

    const handleDeleteCaseType = () => {
        deleteCaseType(caseTypeDetails.CaseTypeName);
    };

    const handleAddStage = () => {
        setCaseTypeDetails((prev) => {
            const newStage = prev.Descriptions.length + 1;
            return {
                ...prev,
                NumberOfStages: newStage.toString(),
                Descriptions: [...prev.Descriptions, { Stage: newStage, Text: "", Timestamp: "", New: false }],
            };
        });
    };

    if (isFetching) {
        return <SimpleLoader />;
    }

    return (
        <SimpleContainer style={{ ...style, ...styles.container }}>
            <SimpleScrollView>
                <SimpleContainer style={styles.rowStyle}>
                    <SimpleInput
                        style={styles.inputStyle}
                        title={"שם סוג התיק"}
                        value={caseTypeDetails.CaseTypeName}
                        onChange={(e) => handleInputChange("CaseTypeName", e.target.value)}
                    />
                    <SimpleInput
                        style={styles.inputStyle}
                        title={"מספר שלבים"}
                        value={caseTypeDetails.NumberOfStages}
                        onChange={(e) => handleInputChange("NumberOfStages", e.target.value)}
                    />
                </SimpleContainer>

                {caseTypeDetails.Descriptions.map((description, index) => (
                    <SimpleTextArea
                        key={index}
                        title={`תיאור מס' ${index + 1}`}
                        value={description.Text || ""}
                        onChange={(text) => {
                            setCaseTypeDetails((prev) => {
                                const updatedDescriptions = [...prev.Descriptions];
                                updatedDescriptions[index].Text = text;
                                return { ...prev, Descriptions: updatedDescriptions };
                            });
                        }}
                    />
                ))}

                <SimpleContainer style={styles.buttonsRowStyle}>
                    {caseTypeName && (
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
                        isPerforming={isSaving}
                        style={styles.button}
                    >
                        {isSaving ? "שומר..." : caseTypeName ? "עדכן סוג תיק" : "שמור סוג תיק"}
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
