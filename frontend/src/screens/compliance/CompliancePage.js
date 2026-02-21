import React from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import CompliancePageLayout from "./CompliancePageLayout";
import { SecurityScreenName } from "./SecurityScreen";
import { PrivacyPageName } from "./PrivacyPage";
import { ContinuityPageName } from "./ContinuityPage";

export const CompliancePageName = "/compliance";

function LinkCard({ titleKey, descKey, to }) {
    const { t } = useTranslation();
    const navigate = useNavigate();

    return (
        <div
            className="lw-complianceSection"
            onClick={() => navigate(to)}
            style={{ cursor: "pointer" }}
            role="link"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && navigate(to)}
        >
            <h2 className="lw-complianceSection__heading">{t(titleKey)}</h2>
            <div className="lw-complianceSection__text">{t(descKey)}</div>
        </div>
    );
}

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

export default function CompliancePage() {
    return (
        <CompliancePageLayout titleKey="compliance.hub.pageTitle">
            <Section headingKey="compliance.hub.overviewTitle" textKey="compliance.hub.overviewText" />
            <LinkCard titleKey="compliance.security.pageTitle" descKey="compliance.hub.securityDesc" to={SecurityScreenName} />
            <LinkCard titleKey="compliance.privacy.pageTitle" descKey="compliance.hub.privacyDesc" to={PrivacyPageName} />
            <LinkCard titleKey="compliance.continuity.pageTitle" descKey="compliance.hub.continuityDesc" to={ContinuityPageName} />
        </CompliancePageLayout>
    );
}
