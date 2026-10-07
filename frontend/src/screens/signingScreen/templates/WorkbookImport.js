import React, { useEffect, useRef, useState } from 'react';
import PrimaryButton from '../../../components/styledComponents/buttons/PrimaryButton';
import SecondaryButton from '../../../components/styledComponents/buttons/SecondaryButton';
import StatusNotice from '../../../components/ui/StatusNotice';
import useSigningLocale from './useSigningLocale';

const MAX_BYTES = 2 * 1024 * 1024;
const FIELDS = ['name', 'email', 'phone', 'channel'];
function readBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
}

function suggestedMapping(sheet, roles) {
    const allowed = new Set(['key', ...roles.flatMap(role => FIELDS.map(field => `${role.key}.${field}`))]);
    return Object.fromEntries(sheet.columns.filter(column => allowed.has(column.suggestedKey)
        && sheet.columns.filter(other => other.suggestedKey === column.suggestedKey).length === 1)
        .map(column => [column.suggestedKey, column.index]));
}

export default function WorkbookImport({ api, versionId, roles, layout, hasRecipients, onApply, onPending }) {
    const { t, direction, number } = useSigningLocale();
    const [file, setFile] = useState(null);
    const [sheets, setSheets] = useState([]);
    const [sheetId, setSheetId] = useState(null);
    const [columns, setColumns] = useState({});
    const [preview, setPreview] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const generation = useRef(0);
    const sheet = sheets.find(item => item.id === sheetId);
    useEffect(() => () => { generation.current += 1; }, []);
    useEffect(() => { onPending(!!file); return () => onPending(false); }, [file, onPending]);
    const cancel = () => { generation.current += 1; setFile(null); setSheets([]); setPreview(null); setError(null); setBusy(false); };
    const inspect = async selected => {
        if (!selected) return;
        const current = ++generation.current;
        setError(null); setPreview(null); setSheets([]);
        if (selected.size > MAX_BYTES) { setFile(null); setError({ code: 'WORKBOOK_TOO_LARGE' }); return; }
        setFile({ name: selected.name }); setBusy(true);
        try {
            const base64 = await readBase64(selected);
            const result = await api.inspectWorkbook(versionId, base64, layout);
            if (current !== generation.current) return;
            const first = result.sheets[0];
            setFile({ name: selected.name, base64 }); setSheets(result.sheets);
            setSheetId(first.id); setColumns(suggestedMapping(first, roles));
        } catch (failure) { if (current === generation.current) setError(failure); }
        finally { if (current === generation.current) setBusy(false); }
    };
    const map = (key, value) => { setColumns(current => {
        const next = { ...current }; if (value) next[key] = Number(value); else delete next[key]; return next;
    }); setPreview(null); setError(null); };
    const check = async () => {
        const current = ++generation.current;
        setBusy(true); setError(null);
        try {
            const result = await api.parseWorkbook(versionId, file.base64, { ...layout, mapping: { sheetId, columns } });
            if (current === generation.current) setPreview(result);
        } catch (failure) { if (current === generation.current) setError(failure); }
        finally { if (current === generation.current) setBusy(false); }
    };
    const complete = roles.every(role => columns[`${role.key}.name`] && (columns[`${role.key}.email`] || columns[`${role.key}.phone`]));
    const duplicate = new Set(Object.values(columns)).size !== Object.keys(columns).length;
    const select = (key, label, required = false) => {
        const selected = sheet.columns.find(column => column.index === columns[key]);
        return <div className="lw-signingCompose__field" key={key}>
            <label htmlFor={`map-${key}`}>{label}{required ? ` (${t('signingV2.compose.mapping.required')})` : ''}</label>
            <select id={`map-${key}`} dir={direction} value={columns[key] || ''} disabled={busy} onChange={event => map(key, event.target.value)}>
                <option value="">{t('signingV2.compose.mapping.skip')}</option>
                {sheet.columns.map(column => <option key={column.index} value={column.index}>
                    {number(column.index)} · {column.header || t('signingV2.compose.mapping.noHeader')}
                </option>)}
            </select>
            {selected && <small><bdi>{selected.samples.filter(Boolean).join(' · ') || t('signingV2.compose.mapping.noSample')}</bdi></small>}
        </div>;
    };
    return <div className="lw-signingCompose__import">
        <label className="lw-signingCompose__file">
            <span>{busy ? t('signingV2.compose.excel.reading') : t('signingV2.compose.excel.upload')}</span>
            <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={busy}
                onChange={event => { inspect(event.target.files?.[0]); event.target.value = ''; }} />
        </label>
        {error && <StatusNotice embedded><p>{t(`signingV2.compose.errors.${error.code}`, { defaultValue: t('signingV2.compose.errors.INVALID_WORKBOOK') })}</p></StatusNotice>}
        {file && <>
            <p><bdi>{file.name}</bdi></p>
            {sheet && !preview && <>
                <h3>{t('signingV2.compose.mapping.heading')}</h3>
                <p>{t('signingV2.compose.mapping.help')}</p>
                {sheets.length > 1 && <div className="lw-signingCompose__field">
                    <label htmlFor="mapping-sheet">{t('signingV2.compose.mapping.sheet')}</label>
                    <select id="mapping-sheet" dir={direction} value={sheetId} disabled={busy} onChange={event => {
                        const next = sheets.find(item => item.id === Number(event.target.value));
                        setSheetId(next.id); setColumns(suggestedMapping(next, roles)); setError(null);
                    }}>{sheets.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
                </div>}
                {roles.map(role => <fieldset key={role.key} className="lw-signingCompose__mappingRole">
                    <legend>{role.label}</legend>
                    <div className="lw-signingCompose__identity">{FIELDS.map(field => select(`${role.key}.${field}`, t(`signingV2.compose.fields.${field}`), field === 'name'))}</div>
                </fieldset>)}
                {select('key', t('signingV2.compose.rows.key'))}
                {duplicate && <p role="alert">{t('signingV2.compose.errors.INVALID_COLUMN_MAPPING')}</p>}
                <p>{t('signingV2.compose.mapping.contactRequired')}</p>
                <PrimaryButton disabled={busy || !complete || duplicate} onPress={check}>{t('signingV2.compose.mapping.preview')}</PrimaryButton>
            </>}
            {preview && <div aria-live="polite">
                <h3>{t('signingV2.compose.mapping.previewTitle', { count: preview.rows.length, formattedCount: number(preview.rows.length) })}</h3>
                <p>{t('signingV2.compose.mapping.previewHelp')}</p>
                <ul className="lw-signingCompose__plainList">{preview.rows.slice(0, 5).map(row => <li key={row.sourceRow}>
                    <strong>{t('signingV2.compose.excel.issueRow', { row: number(row.sourceRow) })}</strong>
                    {roles.map(role => <div key={role.key}><bdi>{role.label}</bdi>: <bdi>{[row.recipients[role.key]?.name, row.recipients[role.key]?.email, row.recipients[role.key]?.phone].filter(Boolean).join(' · ')}</bdi></div>)}
                </li>)}</ul>
                {preview.errors.length > 0 && <StatusNotice embedded>
                    <p>{t('signingV2.compose.excel.issues', { count: preview.errors.length, formattedCount: number(preview.errors.length) })}</p>
                    <ul>{preview.errors.slice(0, 20).map(issue => <li key={issue.row}>{t('signingV2.compose.excel.issueRow', { row: number(issue.row) })}: {t(`signingV2.compose.rowErrors.${issue.code}`)}</li>)}</ul>
                </StatusNotice>}
                {hasRecipients && <p>{t('signingV2.compose.mapping.replaceWarning')}</p>}
                <div className="lw-signingPackages__actions">
                    <SecondaryButton onPress={() => setPreview(null)}>{t('signingV2.compose.mapping.edit')}</SecondaryButton>
                    <PrimaryButton disabled={!preview.rows.length} onPress={() => { onApply(preview); cancel(); }}>{t(hasRecipients ? 'signingV2.compose.mapping.replace' : 'signingV2.compose.mapping.apply')}</PrimaryButton>
                </div>
            </div>}
            <SecondaryButton onPress={cancel}>{t('common.cancel')}</SecondaryButton>
        </>}
    </div>;
}
