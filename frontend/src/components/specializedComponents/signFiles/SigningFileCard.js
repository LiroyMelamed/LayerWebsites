import React from "react";
import SimpleContainer from "../../simpleComponents/SimpleContainer";
import { Text14, TextBold16 } from "../text/AllTextKindFile";
import "./signFiles.scss";

const getStatusMeta = (status) => {
    const map = {
        pending: { text: "בהמתנה" },
        signed: { text: "חתום" },
        rejected: { text: "נדחה" },
        archived: { text: "ארכיון" },
    };
    return map[status] || map.pending;
};

export default function SigningFileCard({ file, detailsRows = [], children }) {
    const statusMeta = getStatusMeta(file.Status);
    const statusKey = (file?.Status || 'pending').toLowerCase();
    const statusClassName = `lw-signing-fileCardStatus is-${statusKey}`;

    return (
        <SimpleContainer className="lw-signing-fileCard">
            <SimpleContainer className="lw-signing-fileCardHeader">
                <TextBold16>{file.FileName}</TextBold16>
                <SimpleContainer className={statusClassName}>
                    {statusMeta.text}
                </SimpleContainer>
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
