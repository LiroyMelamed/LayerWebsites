import React from "react";
import { useTranslation } from "react-i18next";
import CompliancePageLayout from "./CompliancePageLayout";

export const ContinuityPageName = "/continuity";

function Section({ headingKey, textKey }) {
    const { t } = useTranslation();
    return (
        <div className="lw-complianceSection">
            <h2 className="lw-complianceSection__heading">{t(headingKey)}</h2>
            <div
                className="lw-complianceSection__text"
                dangerouslySetInnerHTML={{ __html: t(textKey) }}
            />
        </div>
    );
}

export default function ContinuityPage() {
    return (
        <CompliancePageLayout titleKey="compliance.continuity.pageTitle">
            <Section headingKey="compliance.continuity.whatIsTitle" textKey="compliance.continuity.whatIsText" />
            <Section headingKey="compliance.continuity.whatItMeansTitle" textKey="compliance.continuity.whatItMeansText" />
            <Section headingKey="compliance.continuity.whatWeDoTitle" textKey="compliance.continuity.whatWeDoText" />
            <Section headingKey="compliance.continuity.roadmapTitle" textKey="compliance.continuity.roadmapText" />
            <Section headingKey="compliance.continuity.statusTitle" textKey="compliance.continuity.statusText" />
        </CompliancePageLayout>
    );
}
