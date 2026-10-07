import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import signingPackagesApi from '../../../api/signingPackagesApi';
import PrimaryButton from '../../../components/styledComponents/buttons/PrimaryButton';
import SecondaryButton from '../../../components/styledComponents/buttons/SecondaryButton';
import SegmentedSwitch from '../../../components/styledComponents/SegmentedSwitch';
import SimpleCard from '../../../components/simpleComponents/SimpleCard';
import useSigningLocale from './useSigningLocale';
import { newKey } from './ParticipantActionDialog';
import './signingPackages.scss';
import './signingCompose.scss';

const STEPS = ['template', 'recipients', 'review', 'done'];
const FIELDS = ['name', 'email', 'phone', 'channel', 'locale'];
const MAX_ROWS = 200;
const MAX_WORKBOOK_BYTES = 2 * 1024 * 1024;

let localId = 0;
const blankPerson = () => ({ name: '', email: '', phone: '', channel: '', locale: '' });
const blankRow = roles => ({ id: `row-${++localId}`, key: '', recipients: Object.fromEntries(roles.map(role => [role.key, blankPerson()])) });
const filled = person => FIELDS.some(field => String(person?.[field] || '').trim());
const rowFilled = row => row.key.trim() || Object.values(row.recipients).some(filled);
const clean = person => ({
    name: person.name.trim(), email: person.email.trim(), phone: person.phone.trim(),
    ...(person.channel ? { channel: person.channel } : {}), ...(person.locale ? { locale: person.locale } : {}),
});
const fieldId = (scope, roleKey, field) => `compose-${scope}-${roleKey}-${field}`;

function readBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
}

function Field({ id, label, help, error, className = '', children }) {
    const { t } = useSigningLocale();
    const helpId = help ? `${id}-help` : null, errorId = error ? `${id}-error` : null;
    const described = [errorId, helpId].filter(Boolean).join(' ') || undefined;
    return <div className={`lw-signingCompose__field ${className}`.trim()}>
        <label htmlFor={id}>{label}</label>
        {React.cloneElement(children, { id, 'aria-invalid': error ? true : undefined, 'aria-describedby': described })}
        {error && <small id={errorId} className="lw-signingCompose__fieldError">{t(`signingV2.compose.rowErrors.${error}`, { defaultValue: t('signingV2.compose.rowErrors.INVALID_ROW') })}</small>}
        {help && <small id={helpId}>{help}</small>}
    </div>;
}

function PersonFields({ scope, roleKey, person, errors, onChange, compact }) {
    const { t } = useSigningLocale();
    const field = (name, control) => <Field key={name} id={fieldId(scope, roleKey, name)} label={t(`signingV2.compose.fields.${name}`)} error={errors?.[name]}>{control}</Field>;
    const change = name => event => onChange(roleKey, name, event.target.value);
    const choices = (name, first, values) => <select value={person[name]} onChange={change(name)}>
        {[['', first], ...values.map(value => [value, t(`signingV2.compose.${name}.${value}`)])].map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </select>;
    return <div className={`lw-signingCompose__person${compact ? ' is-compact' : ''}`}>
        {field('name', <input value={person.name} maxLength={300} autoComplete="off" onChange={change('name')} />)}
        {field('email', <input type="email" dir="ltr" value={person.email} maxLength={254} autoComplete="off" inputMode="email" onChange={change('email')} />)}
        {field('phone', <input type="tel" dir="ltr" value={person.phone} maxLength={20} autoComplete="off" inputMode="tel" onChange={change('phone')} />)}
        {field('channel', choices('channel', t('signingV2.compose.channel.auto'), ['email', 'sms', 'both']))}
        {field('locale', choices('locale', t('signingV2.compose.locale.template'), ['he', 'ar', 'en']))}
    </div>;
}

const RecipientRow = memo(function RecipientRow({ row, index, roles, errors, onChange, onRemove, canRemove }) {
    const { t, number } = useSigningLocale();
    const change = useCallback((roleKey, field, value) => onChange(row.id, roleKey, field, value), [onChange, row.id]);
    const rowNumber = number(index + 1);
    return <li className="lw-signingCompose__row">
        <fieldset aria-invalid={errors ? true : undefined}>
            <legend>{t('signingV2.compose.rows.row', { number: rowNumber })}</legend>
            <div className="lw-signingCompose__rowHeader">
                <Field id={fieldId(row.id, 'row', 'key')} className="is-key" label={t('signingV2.compose.rows.key')} error={errors?.row?.key}>
                    <input value={row.key} maxLength={200} autoComplete="off" onChange={event => onChange(row.id, null, 'key', event.target.value)} />
                </Field>
                {canRemove && <SecondaryButton onPress={() => onRemove(row.id)} aria-label={t('signingV2.compose.rows.remove', { number: rowNumber })}>
                    {t('signingV2.compose.rows.removeShort')}
                </SecondaryButton>}
            </div>
            {errors?.row?.general && <p className="lw-signingCompose__fieldError" role="note">{t(`signingV2.compose.rowErrors.${errors.row.general}`, { defaultValue: t('signingV2.compose.rowErrors.INVALID_ROW') })}</p>}
            {roles.map(role => <div key={role.key} className="lw-signingCompose__roleBlock">
                {roles.length > 1 && <h4>{role.label}</h4>}
                <PersonFields scope={row.id} roleKey={role.key} person={row.recipients[role.key]} errors={errors?.[role.key]} onChange={change} compact />
            </div>)}
        </fieldset>
    </li>;
});

function Stepper({ step }) {
    const { t, number } = useSigningLocale();
    const current = STEPS.indexOf(step);
    return <ol className="lw-signingCompose__steps" aria-label={t('signingV2.compose.stepsLabel')}>
        {STEPS.map((item, index) => <li key={item} aria-current={index === current ? 'step' : undefined}
            className={index < current ? 'is-done' : index === current ? 'is-current' : ''}>
            <span aria-hidden="true">{number(index + 1)}</span>{t(`signingV2.compose.steps.${item}`)}
        </li>)}
    </ol>;
}

function TemplateStep({ api, selected, onSelect }) {
    const { t, number, language, errorMessage } = useSigningLocale();
    const [catalog, setCatalog] = useState(null);
    const [error, setError] = useState(null);
    const [converting, setConverting] = useState(null);
    const load = useCallback(async () => {
        setError(null);
        try { setCatalog(await api.templates()); } catch (failure) { setError(failure); }
    }, [api]);
    useEffect(() => { load(); }, [load]);
    const convert = async legacy => {
        setConverting(legacy.id); setError(null);
        try {
            const imported = await api.importLegacy(legacy.id, language);
            const next = await api.templates();
            setCatalog(next);
            const template = next.templates.find(item => item.versionId === imported.versionId);
            if (template) onSelect(template);
        } catch (failure) { setError(failure); } finally { setConverting(null); }
    };
    if (!catalog && !error) return <p role="status">{t('common.loading')}</p>;
    return <div className="lw-signingCompose__templates">
        {error && <div className="lw-signingPackages__error" role="alert"><span>{errorMessage(error)}</span><SecondaryButton onPress={load}>{t('common.retry')}</SecondaryButton></div>}
        {catalog && <>
            <h2>{t('signingV2.compose.template.heading')}</h2>
            {!catalog.templates.length && <p>{t('signingV2.compose.template.empty')}</p>}
            <ul className="lw-signingCompose__templateList">{catalog.templates.map(template => {
                const active = selected?.versionId === template.versionId;
                return <li key={template.versionId}>
                    <button type="button" className={`lw-signingCompose__templateCard${active ? ' is-selected' : ''}`} aria-pressed={active} onClick={() => onSelect(template)}>
                        <strong>{template.name}</strong>
                        <span>{t('signingV2.compose.template.documents', { count: template.documentCount, formattedCount: number(template.documentCount) })}</span>
                        <span>{template.roles.map(role => role.label).join(' · ')}</span>
                        {active && <span className="lw-signingCompose__badge">{t('signingV2.compose.template.selected')}</span>}
                    </button>
                </li>;
            })}</ul>
            {catalog.legacy.length > 0 && <section className="lw-signingCompose__legacy" aria-labelledby="compose-legacy-title">
                <h3 id="compose-legacy-title">{t('signingV2.compose.template.legacyHeading')}</h3>
                <p>{t('signingV2.compose.template.legacyHelp')}</p>
                <ul>{catalog.legacy.map(legacy => <li key={legacy.id}>
                    <span><strong>{legacy.name}</strong>
                        <small>{t('signingV2.compose.template.documents', { count: legacy.documentCount, formattedCount: number(legacy.documentCount) })} · {legacy.roles.map(role => role.label).join(' · ')}</small></span>
                    <SecondaryButton onPress={() => convert(legacy)} disabled={!!converting} aria-busy={converting === legacy.id}>
                        {converting === legacy.id ? t('signingV2.compose.template.converting') : t('signingV2.compose.template.convert')}
                    </SecondaryButton>
                </li>)}</ul>
            </section>}
        </>}
    </div>;
}

function indexErrors(errors, sentIds) {
    const byRow = {}, shared = {};
    for (const error of errors) {
        const parts = error.path.split('.');
        if (parts[0] === 'shared') { (shared[parts[1]] ||= {})[parts[2]] = error.code; continue; }
        if (parts[0] !== 'rows' || parts.length < 2) continue;
        const id = sentIds[Number(parts[1])];
        if (!id) continue;
        const entry = byRow[id] ||= {};
        if (parts[2] === 'key') (entry.row ||= {}).key = error.code;
        else if (parts.length === 2) (entry.row ||= {}).general = error.code;
        else (entry[parts[2]] ||= {})[parts[3]] = error.code;
    }
    return { byRow, shared };
}

export default function PackageComposer({ api = signingPackagesApi, onBack, onCreated }) {
    const { t, direction, number, language, errorMessage } = useSigningLocale();
    const heading = useRef(null);
    const errorSummary = useRef(null);
    const [step, setStep] = useState('template');
    const [template, setTemplate] = useState(null);
    const [name, setName] = useState('');
    const [shared, setShared] = useState({});
    const [rows, setRows] = useState([]);
    const [source, setSource] = useState('manual');
    const [importNote, setImportNote] = useState(null);
    const [check, setCheck] = useState(null);
    const [busy, setBusy] = useState(null);
    const [error, setError] = useState(null);
    const [result, setResult] = useState(null);
    const [leaving, setLeaving] = useState(false);
    const createKey = useRef(null);
    const creating = useRef(false);

    const shareRoles = template ? template.roles.filter(role => role.audience === 'shared') : [];
    const eachRoles = template ? template.roles.filter(role => role.audience !== 'shared') : [];
    const dirty = rows.some(rowFilled) || Object.values(shared).some(filled) || !!name.trim();

    useEffect(() => { heading.current?.focus(); }, [step]);
    const invalidate = () => { setCheck(null); createKey.current = null; };

    const chooseTemplate = selected => {
        if (selected.versionId === template?.versionId) return;
        const roles = selected.roles.filter(role => role.audience !== 'shared');
        setTemplate(selected);
        setShared(Object.fromEntries(selected.roles.filter(role => role.audience === 'shared').map(role => [role.key, blankPerson()])));
        setRows([blankRow(roles)]);
        setName(current => current || selected.name);
        setImportNote(null); invalidate();
    };
    const changeRow = useCallback((rowId, roleKey, field, value) => {
        setRows(current => current.map(row => {
            if (row.id !== rowId) return row;
            if (!roleKey) return { ...row, [field]: value };
            return { ...row, recipients: { ...row.recipients, [roleKey]: { ...row.recipients[roleKey], [field]: value } } };
        }));
        setCheck(null); createKey.current = null;
    }, []);
    const removeRow = useCallback(rowId => { setRows(current => current.filter(row => row.id !== rowId)); setCheck(null); createKey.current = null; }, []);
    const changeShared = useCallback((roleKey, field, value) => {
        setShared(current => ({ ...current, [roleKey]: { ...current[roleKey], [field]: value } }));
        setCheck(null); createKey.current = null;
    }, []);

    const downloadWorkbook = async () => {
        setBusy('download'); setError(null);
        try {
            const blob = await api.workbook(template.versionId, language);
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url; link.download = `${template.name}.xlsx`;
            document.body.appendChild(link); link.click(); link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (failure) { setError(failure); } finally { setBusy(null); }
    };
    const uploadWorkbook = async file => {
        if (!file) return;
        setError(null); setImportNote(null);
        if (file.size > MAX_WORKBOOK_BYTES) { setError({ code: 'WORKBOOK_TOO_LARGE' }); return; }
        setBusy('upload');
        try {
            const parsed = await api.parseWorkbook(template.versionId, await readBase64(file));
            const imported = parsed.rows.map(row => ({
                id: `row-${++localId}`, key: row.key || '',
                recipients: Object.fromEntries(eachRoles.map(role => [role.key, { ...blankPerson(), ...Object.fromEntries(Object.entries(row.recipients[role.key] || {}).map(([key, value]) => [key, value || ''])) }])),
            }));
            setRows(imported.length ? imported : [blankRow(eachRoles)]);
            setImportNote({ count: imported.length, issues: parsed.errors });
            invalidate();
        } catch (failure) { setError(failure); } finally { setBusy(null); }
    };

    const payload = () => {
        const sent = rows.filter(rowFilled);
        return {
            sentIds: sent.map(row => row.id),
            body: {
                templateVersionId: template.versionId, name: name.trim(),
                shared: Object.fromEntries(Object.entries(shared).map(([key, person]) => [key, clean(person)])),
                rows: sent.map(row => ({ ...(row.key.trim() ? { key: row.key.trim() } : {}), recipients: Object.fromEntries(Object.entries(row.recipients).map(([key, person]) => [key, clean(person)])) })),
            },
        };
    };
    const runCheck = async () => {
        setError(null);
        const { body, sentIds } = payload();
        if (!body.name) { setError({ code: 'RUN_NAME_REQUIRED' }); return; }
        if (!body.rows.length) { setError({ code: 'ROWS_REQUIRED' }); return; }
        if (body.rows.length > MAX_ROWS) { setError({ code: 'CAPACITY_BUDGET_EXCEEDED' }); return; }
        setBusy('check');
        try {
            const preview = await api.previewCreation(body);
            const next = { preview, body, sentIds, indexed: indexErrors(preview.errors || [], sentIds) };
            setCheck(next);
            if (preview.valid) { createKey.current = newKey(); setStep('review'); }
            else requestAnimationFrame(() => errorSummary.current?.focus());
        } catch (failure) { setError(failure); } finally { setBusy(null); }
    };
    const create = async () => {
        if (creating.current || !check?.preview.valid) return;
        creating.current = true; setBusy('create'); setError(null);
        try {
            const created = await api.create({ ...check.body, previewHash: check.preview.previewHash }, createKey.current);
            setResult(created); setStep('done');
        } catch (failure) {
            if (failure.code === 'PREVIEW_CHANGED' || failure.code === 'INVALID_ROWS') { invalidate(); setStep('recipients'); }
            if (failure.code === 'IDEMPOTENCY_CONFLICT') createKey.current = newKey();
            setError(failure);
        } finally { creating.current = false; setBusy(null); }
    };
    const leave = () => { if (step !== 'done' && dirty && !leaving) setLeaving(true); else onBack?.(); };
    const restart = () => { setStep('template'); setTemplate(null); setRows([]); setShared({}); setName(''); setResult(null); setImportNote(null); invalidate(); };

    const errorCount = check && !check.preview.valid ? check.preview.errorCount : 0;
    const errorEntries = check && !check.preview.valid ? check.preview.errors : [];
    const roleLabel = key => template?.roles.find(role => role.key === key)?.label || key;
    const describeError = item => {
        const parts = item.path.split('.');
        const field = parts.at(-1);
        const fieldLabel = FIELDS.includes(field) ? t(`signingV2.compose.fields.${field}`) : field === 'key' ? t('signingV2.compose.rows.key') : '';
        const where = parts[0] === 'shared' ? roleLabel(parts[1])
            : parts.length >= 2 ? t('signingV2.compose.rows.row', { number: number(Number(parts[1]) + 1) }) + (parts[2] && parts[2] !== 'key' && eachRoles.length > 1 ? ` · ${roleLabel(parts[2])}` : '') : '';
        return { where, fieldLabel, message: t(`signingV2.compose.rowErrors.${item.code}`, { defaultValue: t('signingV2.compose.rowErrors.INVALID_ROW') }),
            target: parts[0] === 'shared' ? fieldId('shared', parts[1], field) : check.sentIds[Number(parts[1])] && (parts.length === 4 ? fieldId(check.sentIds[Number(parts[1])], parts[2], field) : fieldId(check.sentIds[Number(parts[1])], 'row', 'key')) };
    };
    const BackIcon = direction === 'rtl' ? ArrowRight : ArrowLeft;
    const filledRows = rows.filter(rowFilled).length;
    const preview = check?.preview;
    const sharedNames = preview?.shared?.map(item => item.name).join(', ');

    return <section className="lw-signingPackages lw-signingCompose" dir={direction} aria-labelledby="signing-compose-title">
        <header className="lw-signingPackages__heading">
            <div>
                <button type="button" className="lw-signingPackages__textButton lw-signingCompose__back" onClick={leave}><BackIcon size={16} aria-hidden="true" />{t('signingV2.compose.back')}</button>
                <h1 id="signing-compose-title" ref={heading} tabIndex={-1}>{t('signingV2.compose.title')}</h1>
                <p>{t('signingV2.compose.subtitle')}</p>
            </div>
        </header>
        {leaving && <div className="lw-signingCompose__confirm" role="alertdialog" aria-labelledby="compose-leave-title" aria-describedby="compose-leave-body">
            <strong id="compose-leave-title">{t('signingV2.compose.discardTitle')}</strong>
            <p id="compose-leave-body">{t('signingV2.compose.discardBody')}</p>
            <div className="lw-signingPackages__actions">
                <SecondaryButton onPress={() => setLeaving(false)}>{t('signingV2.compose.keepEditing')}</SecondaryButton>
                <PrimaryButton onPress={() => onBack?.()}>{t('signingV2.compose.discardConfirm')}</PrimaryButton>
            </div>
        </div>}
        <Stepper step={step} />
        {error && <div className="lw-signingPackages__error" role="alert"><span>{t(`signingV2.compose.errors.${error.code}`, { defaultValue: errorMessage(error) })}</span></div>}

        {step === 'template' && <SimpleCard className="lw-signingCompose__card">
            <TemplateStep api={api} selected={template} onSelect={chooseTemplate} />
            <footer className="lw-signingCompose__footer">
                <PrimaryButton onPress={() => setStep('recipients')} disabled={!template}>{t('signingV2.compose.next')}</PrimaryButton>
            </footer>
        </SimpleCard>}

        {step === 'recipients' && template && <>
            <SimpleCard className="lw-signingCompose__card">
                <h2>{t('signingV2.compose.details')}</h2>
                <Field id="compose-run-name" className="is-wide" label={t('signingV2.compose.runName')} help={t('signingV2.compose.runNameHelp')}>
                    <input value={name} maxLength={300} onChange={event => { setName(event.target.value); invalidate(); }} />
                </Field>
                <p className="lw-signingPackages__caption">{t('signingV2.compose.templateSummary', { name: template.name })}</p>
            </SimpleCard>
            {shareRoles.length > 0 && <SimpleCard className="lw-signingCompose__card">
                <h2>{t('signingV2.compose.shared.heading')}</h2>
                <p>{t('signingV2.compose.shared.help')}</p>
                {shareRoles.map(role => <fieldset key={role.key} className="lw-signingCompose__shared">
                    <legend>{role.label}</legend>
                    <PersonFields scope="shared" roleKey={role.key} person={shared[role.key] || blankPerson()} errors={check?.indexed.shared[role.key]} onChange={changeShared} />
                </fieldset>)}
            </SimpleCard>}
            <SimpleCard className="lw-signingCompose__card">
                <div className="lw-signingCompose__rowsHeading">
                    <div>
                        <h2>{t('signingV2.compose.rows.heading')}</h2>
                        <p>{t('signingV2.compose.rows.help', { roles: eachRoles.map(role => role.label).join(' · '), max: number(MAX_ROWS) })}</p>
                    </div>
                    <SegmentedSwitch value={source} onChange={setSource} ariaLabel={t('signingV2.compose.rows.source')}
                        options={[{ value: 'manual', label: t('signingV2.compose.rows.manual') }, { value: 'excel', label: t('signingV2.compose.rows.excel') }]} />
                </div>
                {source === 'excel' && <div className="lw-signingCompose__excel">
                    <ol>
                        <li>{t('signingV2.compose.excel.stepDownload')} <SecondaryButton onPress={downloadWorkbook} disabled={!!busy}>{busy === 'download' ? t('common.loading') : t('signingV2.compose.excel.download')}</SecondaryButton></li>
                        <li>{t('signingV2.compose.excel.stepFill', { max: number(MAX_ROWS) })}</li>
                        <li>
                            <label className="lw-signingCompose__file">
                                <span>{busy === 'upload' ? t('signingV2.compose.excel.reading') : t('signingV2.compose.excel.upload')}</span>
                                <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={!!busy}
                                    onChange={event => { uploadWorkbook(event.target.files?.[0]); event.target.value = ''; }} />
                            </label>
                        </li>
                    </ol>
                    {importNote && <div role="status" className="lw-signingCompose__importNote">
                        <p>{t('signingV2.compose.excel.imported', { count: importNote.count, formattedCount: number(importNote.count) })}</p>
                        {importNote.issues.length > 0 && <>
                            <p>{t('signingV2.compose.excel.issues', { count: importNote.issues.length, formattedCount: number(importNote.issues.length) })}</p>
                            <ul>{importNote.issues.slice(0, 20).map(issue => <li key={issue.row}>{t('signingV2.compose.excel.issueRow', { row: number(issue.row) })}: {t(`signingV2.compose.rowErrors.${issue.code}`)}</li>)}</ul>
                        </>}
                    </div>}
                </div>}
                {errorCount > 0 && <div className="lw-signingCompose__errorSummary" role="alert" tabIndex={-1} ref={errorSummary} aria-labelledby="compose-errors-title">
                    <h3 id="compose-errors-title">{t('signingV2.compose.errorsHeading', { count: errorCount, formattedCount: number(errorCount) })}</h3>
                    <ul>{errorEntries.slice(0, 30).map((item, index) => {
                        const info = describeError(item);
                        return <li key={`${item.path}-${index}`}>
                            <button type="button" className="lw-signingPackages__textButton" onClick={() => document.getElementById(info.target)?.focus()}>
                                {[info.where, info.fieldLabel].filter(Boolean).join(' · ')}
                            </button>: {info.message}
                        </li>;
                    })}</ul>
                    {errorCount > 30 && <p>{t('signingV2.compose.moreErrors', { count: errorCount - 30, formattedCount: number(errorCount - 30) })}</p>}
                </div>}
                <ol className="lw-signingCompose__rows">{rows.map((row, index) =>
                    <RecipientRow key={row.id} row={row} index={index} roles={eachRoles} errors={check?.indexed.byRow[row.id]} onChange={changeRow} onRemove={removeRow} canRemove={rows.length > 1} />)}
                </ol>
                <div className="lw-signingPackages__actions">
                    <SecondaryButton onPress={() => { setRows(current => [...current, blankRow(eachRoles)]); invalidate(); }} disabled={rows.length >= MAX_ROWS}>{t('signingV2.compose.rows.add')}</SecondaryButton>
                    <span className="lw-signingPackages__caption" aria-live="polite">{t('signingV2.compose.rows.count', { count: filledRows, formattedCount: number(filledRows), max: number(MAX_ROWS) })}</span>
                </div>
            </SimpleCard>
            <footer className="lw-signingCompose__footer is-sticky">
                <SecondaryButton onPress={() => setStep('template')} disabled={!!busy}>{t('signingV2.compose.previous')}</SecondaryButton>
                <PrimaryButton onPress={runCheck} disabled={!!busy}>{busy === 'check' ? t('signingV2.compose.checking') : t('signingV2.compose.check')}</PrimaryButton>
            </footer>
        </>}

        {step === 'review' && preview?.valid && <>
            <SimpleCard className="lw-signingCompose__card">
                <h2>{t('signingV2.compose.review.heading')}</h2>
                <dl className="lw-signingCompose__summary">
                    <div><dt>{t('signingV2.compose.review.run')}</dt><dd>{check.body.name}</dd></div>
                    <div><dt>{t('signingV2.compose.review.template')}</dt><dd>{preview.template.name}</dd></div>
                    <div><dt>{t('signingV2.compose.review.packages')}</dt><dd><bdi>{number(preview.packageCount)}</bdi></dd></div>
                    <div><dt>{t('signingV2.compose.review.documents')}</dt><dd><bdi>{number(preview.documentCount)}</bdi></dd></div>
                    <div><dt>{t('signingV2.compose.review.recipients')}</dt><dd><bdi>{number(preview.recipientCount)}</bdi></dd></div>
                </dl>
                <h3>{t('signingV2.compose.review.documentList')}</h3>
                <ul className="lw-signingCompose__plainList">{preview.template.documents.map(item => <li key={item.key}>{item.name}</li>)}</ul>
                {preview.shared.length > 0 && <>
                    <h3>{t('signingV2.compose.shared.heading')}</h3>
                    <ul className="lw-signingCompose__plainList">{preview.shared.map(item => <li key={item.roleKey}>{roleLabel(item.roleKey)}: {item.name}</li>)}</ul>
                    <p className="lw-signingCompose__note">{t('signingV2.compose.review.sharedInvitations', { name: sharedNames, count: preview.packageCount, formattedCount: number(preview.packageCount) })}</p>
                </>}
                <h3>{t('signingV2.compose.review.sample', { count: preview.sample.length, formattedCount: number(preview.sample.length) })}</h3>
                <ul className="lw-signingCompose__plainList">{preview.sample.map(item => <li key={item.key}>
                    {item.recipients.map(person => `${roleLabel(person.roleKey)}: ${person.name} (${person.channels.map(channel => t(`signingV2.compose.channel.${channel}`)).join(', ')})`).join(' · ')}
                </li>)}</ul>
                <p className="lw-signingCompose__note">{t('signingV2.compose.review.otp')}</p>
                <p className="lw-signingCompose__note">{t('signingV2.compose.review.effect')}</p>
            </SimpleCard>
            <footer className="lw-signingCompose__footer is-sticky">
                <SecondaryButton onPress={() => setStep('recipients')} disabled={busy === 'create'}>{t('signingV2.compose.review.edit')}</SecondaryButton>
                <PrimaryButton onPress={create} disabled={busy === 'create'} aria-busy={busy === 'create'}>
                    {busy === 'create' ? t('signingV2.compose.review.creating') : t('signingV2.compose.review.confirm', { count: preview.packageCount, formattedCount: number(preview.packageCount) })}
                </PrimaryButton>
            </footer>
        </>}

        {step === 'done' && result && <SimpleCard className="lw-signingCompose__card">
            <div role="status">
                <h2>{t('signingV2.compose.done.heading')}</h2>
                <p>{t('signingV2.compose.done.body', { count: preview?.packageCount || 0, formattedCount: number(preview?.packageCount || 0) })}</p>
                {result.reused && <p>{t('signingV2.compose.done.reused')}</p>}
            </div>
            <footer className="lw-signingCompose__footer">
                <SecondaryButton onPress={restart}>{t('signingV2.compose.done.another')}</SecondaryButton>
                <PrimaryButton onPress={() => onCreated?.(result.submissionId)}>{t('signingV2.compose.done.open')}</PrimaryButton>
            </footer>
        </SimpleCard>}
    </section>;
}
