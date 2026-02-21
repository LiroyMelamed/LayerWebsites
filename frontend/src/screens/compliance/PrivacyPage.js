import React from "react";
import { useTranslation } from "react-i18next";
import CompliancePageLayout from "./CompliancePageLayout";

export const PrivacyPageName = "/privacy";

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

export default function PrivacyPage() {
    return (
        <CompliancePageLayout titleKey="compliance.privacy.pageTitle">
            <Section headingKey="compliance.privacy.whatIsTitle" textKey="compliance.privacy.whatIsText" />
            <Section headingKey="compliance.privacy.whatItMeansTitle" textKey="compliance.privacy.whatItMeansText" />
            <Section headingKey="compliance.privacy.whatWeDoTitle" textKey="compliance.privacy.whatWeDoText" />
            <Section headingKey="compliance.privacy.roadmapTitle" textKey="compliance.privacy.roadmapText" />
            <Section headingKey="compliance.privacy.statusTitle" textKey="compliance.privacy.statusText" />
        </CompliancePageLayout>
    );
}
