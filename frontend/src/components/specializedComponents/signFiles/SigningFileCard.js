import React from "react";
import SimpleContainer from "../../simpleComponents/SimpleContainer";
import { Text14, TextBold16 } from "../text/AllTextKindFile";

const getStatusMeta = (status) => {
    const map = {
        pending: { bg: "#fff3cd", color: "#856404", text: "בהמתנה" },
        signed: { bg: "#d4edda", color: "#155724", text: "חתום" },
        rejected: { bg: "#f8d7da", color: "#721c24", text: "נדחה" },
        archived: { bg: "#e9ecef", color: "#383d41", text: "ארכיון" },
    };
    return map[status] || map.pending;
};

const styles = {
    card: {
        borderRadius: 8,
        border: "1px solid #e0e0e0",
        padding: 16,
        backgroundColor: "#fff",
        marginBottom: 12,
        boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
    },
    headerRow: {
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 10,
    },
    fileName: {
        fontSize: 16,
        fontWeight: 600,
        color: "#333",
        margin: 0,
    },
    statusChip: (status) => {
        const meta = getStatusMeta(status);
        return {
            padding: "4px 10px",
            borderRadius: 16,
            fontSize: 12,
            fontWeight: 600,
            backgroundColor: meta.bg,
            color: meta.color,
        };
    },
    detailRow: {
        fontSize: 13,
        color: "#555",
        marginBottom: 4,
    },
};

export default function SigningFileCard({ file, detailsRows = [], children, style }) {
    const statusMeta = getStatusMeta(file.Status);

    return (
        <SimpleContainer style={{ ...styles.card, ...(style || {}) }}>
            <SimpleContainer style={styles.headerRow}>
                <TextBold16 style={styles.fileName}>{file.FileName}</TextBold16>
                <span style={styles.statusChip(file.Status)}>{statusMeta.text}</span>
            </SimpleContainer>

            {detailsRows.map((row, idx) => (
                <Text14 key={idx} style={styles.detailRow}>
                    <b>{row.label}</b> {row.value}
                </Text14>
            ))}

            {children}
        </SimpleContainer>
    );
}
