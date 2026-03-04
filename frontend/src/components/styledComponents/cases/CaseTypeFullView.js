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
import { useTranslation } from "react-i18next";

import "./CaseTypeFullView.scss";
import TertiaryButton from "../buttons/TertiaryButton";

export default function CaseTypeFullView({ caseTypeDetails, rePerformRequest, onFailureFunction, closePopUpFunction, initialValues, style: _style }) {
    const { t } = useTranslation();
    const initName = caseTypeDetails?.CaseTypeName || initialValues?.CaseTypeName || "";
    const initStages = caseTypeDetails?.NumberOfStages || initialValues?.NumberOfStages || "";
    const initDescs = caseTypeDetails?.Descriptions || initialValues?.Descriptions || [{ Stage: 1, Text: "", Timestamp: "", New: false }];
    const [caseTypeName, setCaseTypeName, caseTypeNameError] = useFieldState(HebrewCharsValidation, initName);
    const [numberOfStages, setNumberOfStages, numberOfStagesError] = useFieldState(NumberOfStagesValidation, initStages);
    const [descriptions, setDescriptions] = useState(initDescs);

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

    const moveStage = (fromIndex, toIndex) => {
        setDescriptions((prev) => {
            const updated = [...prev];
            const [moved] = updated.splice(fromIndex, 1);
            updated.splice(toIndex, 0, moved);
            return updated.map((d, i) => ({ ...d, Stage: i + 1 }));
        });
    };

    const removeStage = (index) => {
        setDescriptions((prev) => {
            const updated = prev.filter((_, i) => i !== index).map((d, i) => ({ ...d, Stage: i + 1 }));
            return updated;
        });
        setNumberOfStages((prev) => prev - 1);
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
        <SimpleContainer className="lw-caseTypeFullView">
            <SimpleScrollView>
                <SimpleContainer className="lw-caseTypeFullView__row">
                    <SimpleContainer className="lw-caseTypeFullView__inputWrap">
                        <SimpleInput
                            title={t('caseTypes.caseTypeName')}
                            value={caseTypeName}
                            onChange={(e) => setCaseTypeName(e.target.value)}
                            error={caseTypeNameError}
                        />
                    </SimpleContainer>
                    <SimpleContainer className="lw-caseTypeFullView__inputWrap">
                        <SimpleInput
                            title={t('cases.stageCount')}
                            value={numberOfStages}
                            onChange={(e) => setNumberOfStages(Number(e.target.value))}
                            error={numberOfStagesError}
                        />
                    </SimpleContainer>
                </SimpleContainer>

                {descriptions.map((description, index) => (
                    <SimpleContainer key={index} className="lw-caseTypeFullView__textAreaRow">
                        <SimpleContainer className="lw-caseTypeFullView__stageHeader">
                            <SimpleContainer className="lw-caseTypeFullView__stageArrows">
                                {index > 0 && (
                                    <button type="button" className="lw-caseTypeFullView__arrowBtn" onClick={() => moveStage(index, index - 1)} title={t('common.moveUp')}>&#x25B2;</button>
                                )}
                                {index < descriptions.length - 1 && (
                                    <button type="button" className="lw-caseTypeFullView__arrowBtn" onClick={() => moveStage(index, index + 1)} title={t('common.moveDown')}>&#x25BC;</button>
                                )}
                            </SimpleContainer>
                            {descriptions.length > 1 && (
                                <button
                                    type="button"
                                    className="lw-caseTypeFullView__removeStageBtn"
                                    onClick={() => removeStage(index)}
                                    title={t('cases.removeStage')}
                                >&#x2715;</button>
                            )}
                        </SimpleContainer>
                        <SimpleTextArea
                            title={t('cases.descriptionNumber', { number: index + 1 })}
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
                        <TertiaryButton
                            onPress={handleDeleteCaseType}
                            isPerforming={isDeleting}
                        >
                            {isDeleting ? t('common.deleting') : t('caseTypes.deleteCaseType')}
                        </TertiaryButton>
                    )}
                    <SecondaryButton
                        onPress={handleAddStage}
                    >
                        {t('caseTypes.addStage')}
                    </SecondaryButton>
                    <PrimaryButton
                        onPress={handleSaveCaseType}
                        isPerforming={isPerforming}
                        disabled={hasError}
                    >
                        {isPerforming ? t('common.saving') : caseTypeDetails ? t('caseTypes.updateCaseType') : t('caseTypes.saveCaseType')}
                    </PrimaryButton>
                    <SecondaryButton
                        onPress={() => closePopUpFunction?.()}
                        className="lw-cancelButton"

                    >
                        {t('common.cancel')}
                    </SecondaryButton>
                </SimpleContainer>
            </SimpleScrollView>
        </SimpleContainer>
    );
}
