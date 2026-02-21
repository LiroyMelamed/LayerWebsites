import React from "react";
import { useTranslation } from "react-i18next";
import CompliancePageLayout from "./CompliancePageLayout";

export const SecurityScreenName = "/SecurityScreen";

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

export default function SecurityScreen() {
    return (
        <CompliancePageLayout titleKey="compliance.security.pageTitle">
            <Section headingKey="compliance.security.whatIsTitle" textKey="compliance.security.whatIsText" />
            <Section headingKey="compliance.security.whatItMeansTitle" textKey="compliance.security.whatItMeansText" />
            <Section headingKey="compliance.security.whatWeDoTitle" textKey="compliance.security.whatWeDoText" />
            <Section headingKey="compliance.security.roadmapTitle" textKey="compliance.security.roadmapText" />
            <Section headingKey="compliance.security.statusTitle" textKey="compliance.security.statusText" />
        </CompliancePageLayout>
    );
}
