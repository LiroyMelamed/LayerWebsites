import React from "react";
import SimpleContainer from "../../simpleComponents/SimpleContainer";
import SecondaryButton from "../../styledComponents/buttons/SecondaryButton";
import { Text14, TextBold24 } from "../text/AllTextKindFile";
import { useTranslation } from "react-i18next";

export default function SignatureSpotMarker({ spot, index, onUpdate, onRemove }) {
    const { t } = useTranslation();
    const handleNumberChange = (field, fallback) => (e) => {
        const value = parseInt(e.target.value, 10);
        onUpdate(index, {
            [field]: Number.isNaN(value) ? fallback : value,
        });
    };

    return (
        <SimpleContainer>
            <SimpleContainer>
                <TextBold24>{t("signing.spotMarker.title", { index: index + 1 })}</TextBold24>

                <SecondaryButton onPress={() => onRemove(index)}>
                    ✖ {t("common.remove")}
                </SecondaryButton>
            </SimpleContainer>

            {/* Signer name */}
            <SimpleContainer>
                <Text14>{t("signing.spotMarker.signerName")}</Text14>
                <input
                    type="text"
                    value={spot.signerName || ""}
                    onChange={(e) =>
                        onUpdate(index, { signerName: e.target.value })
                    }
                />
            </SimpleContainer>

            {/* Page number */}
            <SimpleContainer>
                <Text14>{t("signing.spotMarker.pageNumber")}</Text14>
                <input
                    type="number"
                    min={1}
                    value={spot.pageNum ?? 1}
                    onChange={handleNumberChange("pageNum", 1)}
                />
            </SimpleContainer>

            {/* X / Y in percentages */}
            <SimpleContainer>
                <Text14>{t("signing.spotMarker.positionX")}</Text14>
                <input
                    type="number"
                    min={0}
                    max={100}
                    step={5}
                    value={spot.x ?? 50}
                    onChange={handleNumberChange("x", 50)}
                />
            </SimpleContainer>

            <SimpleContainer>
                <Text14>{t("signing.spotMarker.positionY")}</Text14>
                <input
                    type="number"
                    min={0}
                    max={100}
                    step={5}
                    value={spot.y ?? 50}
                    onChange={handleNumberChange("y", 50)}
                />
            </SimpleContainer>

            {/* Width / height in pixels */}
            <SimpleContainer>
                <Text14>{t("signing.spotMarker.widthPx")}</Text14>
                <input
                    type="number"
                    min={50}
                    value={spot.width ?? 150}
                    onChange={handleNumberChange("width", 150)}
                />
            </SimpleContainer>

            <SimpleContainer>
                <Text14>{t("signing.spotMarker.heightPx")}</Text14>
                <input
                    type="number"
                    min={30}
                    value={spot.height ?? 75}
                    onChange={handleNumberChange("height", 75)}
                />
            </SimpleContainer>

            {/* Required */}
            <SimpleContainer>
                <label>
                    <input
                        type="checkbox"
                        checked={spot.isRequired !== false}
                        onChange={(e) =>
                            onUpdate(index, { isRequired: e.target.checked })
                        }
                    />{" "}
                    <Text14>{t("signing.spotMarker.required")}</Text14>
                </label>
            </SimpleContainer>
        </SimpleContainer>
    );
}
