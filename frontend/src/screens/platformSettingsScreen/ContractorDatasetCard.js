import React, { useId } from 'react';
import SimpleContainer from '../../components/simpleComponents/SimpleContainer';
import SimpleCard from '../../components/simpleComponents/SimpleCard';
import { Text12, Text14, TextBold14 } from '../../components/specializedComponents/text/AllTextKindFile';

export const CM_DATASETS = [
    { key: 'PINKASH', label: 'פנקס הקבלנים הרשומים' },
    { key: 'MANPOWER', label: 'קבלני כח אדם מורשים' },
    { key: 'CRANE', label: 'קבלני כוח אדם – עגורנאי צריח' },
    { key: 'SERVICE', label: 'קבלני שירות – שמירה, אבטחה וניקיון' },
    { key: 'ACTIVE_SITES', label: 'אתרי בנייה פעילים', explicitRecipients: true },
];

export default function ContractorDatasetCard({ dataset: ds, getValue, onChange, SettingInput, tenantName = process.env.REACT_APP_APP_NAME }) {
    const accessibilityId = useId();
    if (String(tenantName || '').toLowerCase() !== 'melamedlaw') return null;
    const accessibleCard = ds.key === 'ACTIVE_SITES';
    const titleId = accessibleCard ? `${accessibilityId}-title` : undefined;
    const row = (label, description, key, type = 'string', fallback = '') => (
        <SimpleContainer className="lw-platformSettings__settingRow" key={key}>
            <SimpleContainer className="lw-platformSettings__settingLabel">
                <Text14 id={accessibleCard ? `${accessibilityId}-${key}-label` : undefined}>{label}</Text14>
                {description && <Text12 id={accessibleCard ? `${accessibilityId}-${key}-description` : undefined} className="lw-platformSettings__settingDescription">{description}</Text12>}
            </SimpleContainer>
            <SimpleContainer className="lw-platformSettings__settingInput">
                <SettingInput setting={{ valueType: type, label }} value={getValue(key, fallback)} onChange={value => onChange(key, value)}
                    inputLabelledBy={accessibleCard ? `${titleId} ${accessibilityId}-${key}-label` : undefined}
                    inputDescribedBy={accessibleCard && description ? `${accessibilityId}-${key}-description` : undefined} />
            </SimpleContainer>
        </SimpleContainer>
    );
    const email = getValue('CM_GLOBAL_EMAIL_RECIPIENTS', '');
    const sms = getValue('CM_GLOBAL_SMS_RECIPIENTS', '');
    return (
        <SimpleCard className="lw-platformSettings__card">
            <SimpleContainer className="lw-platformSettings__settingsList">
                <TextBold14 id={titleId} className="lw-platformSettings__settingName">{ds.label}</TextBold14>
                {ds.explicitRecipients && <Text12>נוספו והוסרו בלבד לפי מספר אתר. הטעינה הראשונה יוצרת נקודת בסיס ללא דוח תוספות. היעלמות מהמאגר אינה הוכחה לסגירת אתר.</Text12>}
                {row('מעקב פעיל', '', `CM_${ds.key}_ENABLED`, 'boolean', ds.explicitRecipients ? false : true)}
                {row(ds.explicitRecipients ? 'נמעני אימייל לדוח הישיר' : 'אימייל (ריק = ברירת מחדל)',
                    ds.explicitRecipients ? 'ריק = ללא דוח ישיר. אין ירושת נמענים או העתק סמוי מההגדרות הגלובליות.' : (email ? `ברירת מחדל: ${email}` : ''),
                    `CM_${ds.key}_EMAIL_RECIPIENTS`)}
                {row(ds.explicitRecipients ? 'נמעני SMS (ריק = ללא SMS)' : 'SMS (ריק = ברירת מחדל)',
                    ds.explicitRecipients ? 'נשלח רק לנמענים המפורשים כאן; אין ירושה מהנמענים הגלובליים.' : (sms ? `ברירת מחדל: ${sms}` : ''),
                    `CM_${ds.key}_SMS_RECIPIENTS`)}
                {ds.explicitRecipients && row('כלול בסיכום הכללי',
                    'הסיכום נשלח לנמעני האימייל הגלובליים ולהעתקי המערכת המוגדרים, בנוסף לדוח הישיר. כבוי = נתוני אתרי הבנייה אינם נכללים בסיכום.',
                    'CM_ACTIVE_SITES_INCLUDE_IN_GLOBAL_SUMMARY', 'boolean', false)}
                {!ds.explicitRecipients && <Text12>הנמענים כאן חלים על הדוח הישיר. הסיכום הכללי נשלח לנמעני האימייל הגלובליים ולהעתקי המערכת המוגדרים.</Text12>}
            </SimpleContainer>
        </SimpleCard>
    );
}
