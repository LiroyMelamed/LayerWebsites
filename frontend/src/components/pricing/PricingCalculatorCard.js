// src/components/pricing/PricingCalculatorCard.js
import React, { useEffect, useMemo, useState } from "react";

import SimpleCard from "../simpleComponents/SimpleCard";
import SimpleContainer from "../simpleComponents/SimpleContainer";

import PrimaryButton from "../styledComponents/buttons/PrimaryButton";
import SecondaryButton from "../styledComponents/buttons/SecondaryButton";
import Separator from "../styledComponents/separators/Separator";
import { buttonSizes } from "../../styles/buttons/buttonSizes";

import { Text14, TextBold14, TextBold24, TextBold32 } from "../specializedComponents/text/AllTextKindFile";
import {
    PRICING_CONFIG,
    getPricingSelectionDefaults,
    resolvePricingLineItems,
} from "./pricingConfig";

import "./PricingCalculatorCard.scss";

function formatMoney(amount) {
    const n = Number(amount);
    const safe = Number.isFinite(n) ? n : 0;
    return `${safe} ${PRICING_CONFIG.currency}`;
}

const DETAILS_BY_SECTION_AND_OPTION = {
    platforms: {
        site: ["גישה מלאה דרך דפדפן"],
        app: ["אפליקציית מובייל ייעודית"],
        site_app: ["דפדפן + אפליקציה", "חווית לקוח מלאה"],
    },
    resources: {
        basic: ["עד 2 מנהלי מערכת", "נפח אחסון: 10GB"],
        pro: ["עד 5 מנהלי מערכת", "נפח אחסון: 20GB"],
        enterprise: ["אין הגבלת מנהלי מערכת", "נפח אחסון: 100GB"],
    },
    signing: {
        none: ["ללא אפשרות חתימה דיגיטלית"],
        "500": ["עד 500 חתימות בחודש", "כולל OTP", "כולל קובץ ראיות"],
        "1500": ["עד 1500 חתימות בחודש", "כולל OTP", "כולל קובץ ראיות"],
        "5000": ["עד 5000 חתימות בחודש", "כולל OTP", "כולל קובץ ראיות"],
    },
};

function OptionGroup({ label, value, options, onChange, sectionKey }) {
    const selected = useMemo(() => options.find((o) => o.id === value) || options[0], [options, value]);
    const details = useMemo(() => {
        const section = DETAILS_BY_SECTION_AND_OPTION[String(sectionKey || "")] || {};
        const lines = section[String(selected?.id || "")] || [];
        return Array.isArray(lines) ? lines : [];
    }, [sectionKey, selected]);

    return (
        <div className="lw-pricingCalculatorCard__field">
            <TextBold14 className="lw-pricingCalculatorCard__label">{label}</TextBold14>
            <SimpleContainer className="lw-pricingCalculatorCard__optionButtons" role="group">
                {options.map((opt) => {
                    const isSelected = value === opt.id;
                    const Button = isSelected ? PrimaryButton : SecondaryButton;

                    return (
                        <Button
                            key={opt.id}
                            size={buttonSizes.MEDIUM}
                            className="lw-pricingCalculatorCard__optionButton"
                            onPress={() => onChange(opt.id)}
                            aria-pressed={isSelected}
                        >
                            {opt.label}
                        </Button>
                    );
                })}
            </SimpleContainer>

            {details.length > 0 && (
                <ul className="lw-pricingCalculatorCard__detailsList">
                    {details.map((line) => (
                        <li key={line}><Text14 className="lw-pricingCalculatorCard__detailLine">{line}</Text14></li>
                    ))}
                </ul>
            )}
        </div>
    );
}

export default function PricingCalculatorCard({
    cardClassName = "",
    subtitleClassName = "",
    dividerClassName = "",
    bulletsClassName = "",
}) {
    const defaults = useMemo(() => getPricingSelectionDefaults(), []);
    const [platformId, setPlatformId] = useState(defaults.platformId);
    const [resourceId, setResourceId] = useState(defaults.resourceId);
    const [signingId, setSigningId] = useState(defaults.signingId);

    const resolved = useMemo(
        () => resolvePricingLineItems({ platformId, resourceId, signingId }),
        [platformId, resourceId, signingId]
    );

    useEffect(() => {
        const isDev = typeof process !== "undefined" && process?.env?.NODE_ENV !== "production";
        if (!isDev) return;

        const sum = (resolved?.breakdown || []).reduce((acc, it) => acc + Number(it?.amount || 0), 0);
        const total = Number(resolved?.total || 0);
        if (total !== sum) {
            console.warn("[PricingCalculator] total mismatch", { total, sum, breakdown: resolved?.breakdown });
        }
        console.assert(total === sum, "[PricingCalculator] total must equal sum(breakdown)", { total, sum });
    }, [resolved]);

    return (
        <SimpleCard className={`${cardClassName} lw-pricingCalculatorCard`}>
            <TextBold24>מחשבון מחיר</TextBold24>
            <Text14 className={`${subtitleClassName} lw-pricingCalculatorCard__subtitle`}>
                בחרו את ההרכב שמתאים למשרד וקבלו פירוט מחיר ברור.
            </Text14>

            <div className="lw-pricingCalculatorCard__grid">
                <SimpleCard className="lw-pricingCalculatorCard__systemCard">
                    <SimpleContainer className="lw-pricingCalculatorCard__systemRow">
                        <TextBold14 className="lw-pricingCalculatorCard__systemLine">המערכת – כלול תמיד</TextBold14>
                    </SimpleContainer>

                    <Text14 className="lw-pricingCalculatorCard__description">כולל ניהול תיקים, לקוחות ומסמכים.</Text14>
                </SimpleCard>

                <OptionGroup
                    label="פלטפורמות"
                    value={platformId}
                    options={PRICING_CONFIG.platforms.filter((p) => p.id !== "none")}
                    onChange={setPlatformId}
                    sectionKey="platforms"
                />
                <OptionGroup
                    label="חבילת משאבים"
                    value={resourceId}
                    options={PRICING_CONFIG.resources}
                    onChange={setResourceId}
                    sectionKey="resources"
                />
                <OptionGroup
                    label="חבילת חתימות"
                    value={signingId}
                    options={PRICING_CONFIG.signing.filter((s) => ["none", "500", "1500", "5000"].includes(String(s.id)))}
                    onChange={setSigningId}
                    sectionKey="signing"
                />
            </div>

            <Separator className={`${dividerClassName} lw-pricingCalculatorCard__divider`} />

            <SimpleCard className="lw-pricingCalculatorCard__summaryCard">
                <TextBold24>סה״כ לחודש</TextBold24>

                <SimpleContainer className="lw-pricingCalculatorCard__totalRow">
                    <TextBold14 className="lw-pricingCalculatorCard__totalLabel">סה״כ</TextBold14>
                    <TextBold32 className="lw-pricingCalculatorCard__totalAmount">
                        {formatMoney(resolved.total)}
                    </TextBold32>
                </SimpleContainer>

                <SimpleContainer className="lw-pricingCalculatorCard__breakdown" role="table" aria-label="פירוט מחיר">
                    {resolved.breakdown.map((it, index) => (
                        <React.Fragment key={it.id}>
                            {index !== 0 && <Separator className="lw-pricingCalculatorCard__breakSep" />}
                            <SimpleContainer className="lw-pricingCalculatorCard__breakRow" role="row">
                                <Text14 className="lw-pricingCalculatorCard__breakLabel" role="cell">
                                    {it.label}
                                </Text14>
                                <TextBold14 className="lw-pricingCalculatorCard__breakAmount" role="cell">
                                    {formatMoney(it.amount)}
                                </TextBold14>
                            </SimpleContainer>
                        </React.Fragment>
                    ))}
                </SimpleContainer>
            </SimpleCard>
        </SimpleCard>
    );
}
