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

// Single source of truth for the resource storage label (matches DB storage_mb_quota).
function formatStorage(storageMb) {
    if (storageMb === null || storageMb === undefined) return "לפי הסכם";
    const mb = Number(storageMb);
    if (!Number.isFinite(mb) || mb <= 0) return "לפי הסכם";
    if (mb >= 1024 && mb % 1024 === 0) return `${mb / 1024} GB`;
    return `${mb} MB`;
}

const DETAILS_BY_SECTION_AND_OPTION = {
    platforms: {
        site: ["גישה מלאה דרך דפדפן"],
        app: ["אפליקציית מובייל ייעודית"],
        site_app: ["דפדפן + אפליקציה", "חווית לקוח מלאה"],
    },
    // Storage line is appended dynamically from each resource's storageMb (see OptionGroup).
    resources: {
        basic: ["עד 2 מנהלי מערכת", "עד 200 SMS בחודש"],
        pro: ["עד 5 מנהלי מערכת", "עד 2000 SMS בחודש"],
        enterprise: ["אין הגבלת מנהלי מערכת", "עד 5000 SMS בחודש"],
    },
    signing: {
        none: ["ללא אפשרות חתימה דיגיטלית"],
        "500": ["עד 500 חתימות בחודש", "כולל OTP", "כולל קובץ ראיות"],
        "1500": ["עד 1500 חתימות בחודש", "כולל OTP", "כולל קובץ ראיות"],
        "5000": ["עד 5000 חתימות בחודש", "כולל OTP", "כולל קובץ ראיות"],
        unlimited: ["חתימות ללא הגבלה", "כולל OTP", "כולל קובץ ראיות"],
    },
};

function OptionGroup({ label, value, options, onChange, sectionKey, disabledIds = [] }) {
    const selected = useMemo(() => options.find((o) => o.id === value) || options[0], [options, value]);
    const details = useMemo(() => {
        const section = DETAILS_BY_SECTION_AND_OPTION[String(sectionKey || "")] || {};
        const baseLines = section[String(selected?.id || "")] || [];
        const lines = Array.isArray(baseLines) ? [...baseLines] : [];
        if (String(sectionKey) === "resources" && selected) {
            lines.push(`נפח אחסון: ${formatStorage(selected.storageMb)}`);
        }
        return lines;
    }, [sectionKey, selected]);

    return (
        <div className="lw-pricingCalculatorCard__field">
            <TextBold14 className="lw-pricingCalculatorCard__label">{label}</TextBold14>
            <SimpleContainer className="lw-pricingCalculatorCard__optionButtons" role="group">
                {options.map((opt) => {
                    const isSelected = value === opt.id;
                    const isDisabled = disabledIds.includes(opt.id);
                    const Button = isSelected ? PrimaryButton : SecondaryButton;

                    return (
                        <Button
                            key={opt.id}
                            size={buttonSizes.MEDIUM}
                            className={`lw-pricingCalculatorCard__optionButton${isDisabled ? " is-disabled" : ""}`}
                            onPress={() => {
                                if (!isDisabled) onChange(opt.id);
                            }}
                            disabled={isDisabled}
                            aria-pressed={isSelected}
                            aria-disabled={isDisabled}
                            title={isDisabled ? "לא ניתן לבחור חבילה נמוכה יותר מהשימוש הנוכחי" : undefined}
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
    value = null,
    onChange = null,
    disabledIds = null,
    footer = null,
}) {
    const defaults = useMemo(() => getPricingSelectionDefaults(), []);
    const [platformId, setPlatformId] = useState(value?.platformId || defaults.platformId);
    const [resourceId, setResourceId] = useState(value?.resourceId || defaults.resourceId);
    const [signingId, setSigningId] = useState(value?.signingId || defaults.signingId);
    const [billingInterval, setBillingInterval] = useState(value?.billingInterval || defaults.billingInterval || "monthly");

    useEffect(() => {
        if (!value) return;
        if (value.platformId) setPlatformId(value.platformId);
        if (value.resourceId) setResourceId(value.resourceId);
        if (value.signingId) setSigningId(value.signingId);
        if (value.billingInterval) setBillingInterval(value.billingInterval);
    }, [value?.platformId, value?.resourceId, value?.signingId, value?.billingInterval]);

    const emit = (next) => {
        onChange?.(next);
    };

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
                    onChange={(id) => {
                        setPlatformId(id);
                        emit({ platformId: id, resourceId, signingId, billingInterval });
                    }}
                    sectionKey="platforms"
                    disabledIds={disabledIds?.platformIds || []}
                />
                <OptionGroup
                    label="חבילת משאבים"
                    value={resourceId}
                    options={PRICING_CONFIG.resources}
                    onChange={(id) => {
                        setResourceId(id);
                        emit({ platformId, resourceId: id, signingId, billingInterval });
                    }}
                    sectionKey="resources"
                    disabledIds={disabledIds?.resourceIds || []}
                />
                <OptionGroup
                    label="חבילת חתימות"
                    value={signingId}
                    options={PRICING_CONFIG.signing.filter((s) => ["none", "500", "1500", "5000", "unlimited"].includes(String(s.id)))}
                    onChange={(id) => {
                        setSigningId(id);
                        emit({ platformId, resourceId, signingId: id, billingInterval });
                    }}
                    sectionKey="signing"
                    disabledIds={disabledIds?.signingIds || []}
                />
                <OptionGroup
                    label="תשלום"
                    value={billingInterval}
                    options={[
                        { id: "monthly", label: "חודשי" },
                        { id: "yearly", label: "שנתי · 10% הנחה" },
                    ]}
                    onChange={(id) => {
                        setBillingInterval(id);
                        emit({ platformId, resourceId, signingId, billingInterval: id });
                    }}
                    sectionKey="interval"
                />
            </div>

            <Separator className={`${dividerClassName} lw-pricingCalculatorCard__divider`} />

            <SimpleCard className="lw-pricingCalculatorCard__summaryCard">
                <TextBold24>{billingInterval === "yearly" ? "סה״כ לשנה + מע״מ" : "סה״כ לחודש + מע״מ"}</TextBold24>

                <SimpleContainer className="lw-pricingCalculatorCard__totalRow">
                    <TextBold14 className="lw-pricingCalculatorCard__totalLabel">סה״כ + מע״מ</TextBold14>
                    <TextBold32 className="lw-pricingCalculatorCard__totalAmount">
                        {formatMoney(billingInterval === "yearly" ? resolved.yearlyTotal : resolved.total)}
                    </TextBold32>
                </SimpleContainer>
                {billingInterval === "yearly" ? (
                    <Text14 className="lw-pricingCalculatorCard__yearlyHint">
                        {`במקום ${formatMoney(resolved.total * 12)} · חסכון ${formatMoney(resolved.yearlySavings)} (10%)`}
                    </Text14>
                ) : (
                    <Text14 className="lw-pricingCalculatorCard__yearlyHint">
                        {`או ${formatMoney(resolved.yearlyTotal)} לשנה · 10% הנחה`}
                    </Text14>
                )}

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
            {footer}
        </SimpleCard>
    );
}
