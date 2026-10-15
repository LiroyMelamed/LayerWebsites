import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { officeIntegrationsApi } from '../../../api/officeIntegrationsApi';
import '../../../screens/officeIntegrations/OfficeIntegrations.scss';
export default function CaseIntegrationUpdates({ caseId }) {
    const { t } = useTranslation();
    const [data, setData] = useState(null), [failed, setFailed] = useState(false);
    useEffect(() => {
        let active = true; setData(null); setFailed(false);
        officeIntegrationsApi.caseUpdates(caseId).then(value => { if (active) setData(value); }).catch(() => { if (active) setFailed(true); });
        return () => { active = false; };
    }, [caseId]);
    if (failed) return <p role="status">{t('officeIntegrations.caseLoadFailed')}</p>;
    if (!data || (!data.updates.length && !data.group)) return null;
    return <section className="office-integrations oi-embedded" dir="rtl"><div className="oi-card">
        {data.updates.length > 0 && <><h3>{t('officeIntegrations.courtUpdates')}</h3>{data.updates.map(e => <article key={e.id}><span className="oi-badge">{t('officeIntegrations.demo')}</span> <strong>{e.title}</strong><p>{e.body}</p></article>)}</>}
        {data.group && <p>WhatsApp: {t(`officeIntegrations.statuses.${data.group.status}`)} {data.group.mode === 'demo' && `(${t('officeIntegrations.demo')})`}</p>}
        {data.group?.error_code?.startsWith('MANAGER_PHONE_') && <p className="oi-note">{t('officeIntegrations.managerPhoneIssue')}</p>}
    </div></section>;
}
