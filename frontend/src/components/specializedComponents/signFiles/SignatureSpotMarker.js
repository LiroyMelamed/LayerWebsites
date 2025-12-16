import React from "react";
import SimpleContainer from "../../simpleComponents/SimpleContainer";
import SecondaryButton from "../../styledComponents/buttons/SecondaryButton";
import { Text14, TextBold24 } from "../text/AllTextKindFile";

export default function SignatureSpotMarker({ spot, index, onUpdate, onRemove }) {
    const handleNumberChange = (field, fallback) => (e) => {
        const value = parseInt(e.target.value, 10);
        onUpdate(index, {
            [field]: Number.isNaN(value) ? fallback : value,
        });
    };

    return (
        <SimpleContainer>
            {/* כותרת + כפתור הסרה */}
            <SimpleContainer>
                <TextBold24>📍 מקום חתימה {index + 1}</TextBold24>

                <SecondaryButton onPress={() => onRemove(index)}>
                    ✖ הסר
                </SecondaryButton>
            </SimpleContainer>

            {/* שם החותם */}
            <SimpleContainer>
                <Text14>שם החותם</Text14>
                <input
                    type="text"
                    value={spot.signerName || ""}
                    onChange={(e) =>
                        onUpdate(index, { signerName: e.target.value })
                    }
                />
            </SimpleContainer>

            {/* מספר עמוד */}
            <SimpleContainer>
                <Text14>מספר עמוד</Text14>
                <input
                    type="number"
                    min={1}
                    value={spot.pageNum ?? 1}
                    onChange={handleNumberChange("pageNum", 1)}
                />
            </SimpleContainer>

            {/* X / Y באחוזים */}
            <SimpleContainer>
                <Text14>מיקום X (באחוזים לרוחב)</Text14>
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
                <Text14>מיקום Y (באחוזים לגובה)</Text14>
                <input
                    type="number"
                    min={0}
                    max={100}
                    step={5}
                    value={spot.y ?? 50}
                    onChange={handleNumberChange("y", 50)}
                />
            </SimpleContainer>

            {/* רוחב / גובה בפיקסלים */}
            <SimpleContainer>
                <Text14>רוחב (px)</Text14>
                <input
                    type="number"
                    min={50}
                    value={spot.width ?? 150}
                    onChange={handleNumberChange("width", 150)}
                />
            </SimpleContainer>

            <SimpleContainer>
                <Text14>גובה (px)</Text14>
                <input
                    type="number"
                    min={30}
                    value={spot.height ?? 75}
                    onChange={handleNumberChange("height", 75)}
                />
            </SimpleContainer>

            {/* חתימה חובה */}
            <SimpleContainer>
                <label>
                    <input
                        type="checkbox"
                        checked={spot.isRequired !== false}
                        onChange={(e) =>
                            onUpdate(index, { isRequired: e.target.checked })
                        }
                    />{" "}
                    <Text14>חתימה חובה</Text14>
                </label>
            </SimpleContainer>
        </SimpleContainer>
    );
}
