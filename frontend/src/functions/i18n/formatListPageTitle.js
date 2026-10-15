/**
 * Formats a list page heading like "כל התיקים (42)".
 */
export default function formatListPageTitle(t, title, count) {
    const label = String(title || "").trim();
    if (!label) return "";
    const n = Number(count);
    if (!Number.isFinite(n) || n < 0) return label;
    return t("common.listTitleWithCount", { title: label, count: n });
}
