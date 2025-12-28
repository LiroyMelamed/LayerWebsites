import React from "react";
import SimpleContainer from "../../simpleComponents/SimpleContainer";
import { Text14, TextBold16 } from "../text/AllTextKindFile";
import "./signFiles.scss";

const getStatusMeta = (status) => {
    const map = {
        pending: { bg: "#fff3cd", color: "#856404", text: "בהמתנה" },
        signed: { bg: "#d4edda", color: "#155724", text: "חתום" },
        rejected: { bg: "#f8d7da", color: "#721c24", text: "נדחה" },
        archived: { bg: "#e9ecef", color: "#383d41", text: "ארכיון" },
    };
    return map[status] || map.pending;
};

export default function SigningFileCard({ file, detailsRows = [], children, style }) {
    const statusMeta = getStatusMeta(file.Status);

    return (
        <SimpleContainer className="lw-signing-fileCard" style={style || undefined}>
            <SimpleContainer className="lw-signing-fileCardHeader">
                <TextBold16>{file.FileName}</TextBold16>
                <span
                    className="lw-signing-fileCardStatus"
                    style={{
                        "--chip-bg": statusMeta.bg,
                        "--chip-color": statusMeta.color,
                    }}
                >
                    {statusMeta.text}
                </span>
            </SimpleContainer>

            {detailsRows.map((row, idx) => (
                <Text14 key={idx} className="lw-signing-fileCardDetail">
                    <b>{row.label}</b> {row.value}
                </Text14>
            ))}

            {children}
        </SimpleContainer>
    );
}
