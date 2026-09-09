import { useTranslation } from "react-i18next";
import formatListPageTitle from "../../../functions/i18n/formatListPageTitle";
import { TextBold20 } from "./AllTextKindFile";
import "./ListPageTitle.scss";

export default function ListPageTitle({
    title,
    count,
    isLoading = false,
    className,
}) {
    const { t } = useTranslation();
    const label = String(title || "").trim();
    const text = isLoading ? label : formatListPageTitle(t, label, count ?? 0);

    if (!text) return null;

    return (
        <TextBold20 className={["lw-listPageTitle", className].filter(Boolean).join(" ")}>{text}</TextBold20>
    );
}
