import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import signingPackagesApi from '../../../api/signingPackagesApi';
import PrimaryButton from '../../../components/styledComponents/buttons/PrimaryButton';
import SecondaryButton from '../../../components/styledComponents/buttons/SecondaryButton';
import SegmentedSwitch from '../../../components/styledComponents/SegmentedSwitch';
import SearchInput from '../../../components/specializedComponents/containers/SearchInput';
import { Text12 } from '../../../components/specializedComponents/text/AllTextKindFile';
import { colors } from '../../../constant/colors';
import signingTemplatesApi from '../../../api/signingTemplatesApi';
import SimpleCard from '../../../components/simpleComponents/SimpleCard';
import useSigningLocale from './useSigningLocale';
import { newKey } from './ParticipantActionDialog';
import StatusNotice from '../../../components/ui/StatusNotice';
import './signingPackages.scss';
import './signingCompose.scss';

const STEPS = ['template', 'recipients', 'review', 'done'];
const FIELDS = ['name', 'email', 'phone', 'channel'];
const LOCALES = new Set(['he', 'ar', 'en']);
const MAX_ROWS = 200;
const MAX_WORKBOOK_BYTES = 2 * 1024 * 1024;

let localId = 0;
const blankPerson = () => ({ name: '', email: '', phone: '', channel: '' });
const blankRow = roles => ({ id: `row-${++localId}`, key: '', recipients: Object.fromEntries(roles.map(role => [role.key, blankPerson()])) });
const filled = person => FIELDS.some(field => String(person?.[field] || '').trim());
const rowFilled = row => row.key.trim() || Object.values(row.recipients).some(filled);
const clean = (person, language) => ({
    name: person.name.trim(), email: person.email.trim(), phone: person.phone.trim(),
    ...(person.channel ? { channel: person.channel } : {}),
    locale: LOCALES.has(language) ? language : 'he',
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
    const { t, direction } = useSigningLocale();
    const helpId = help ? `${id}-help` : null, errorId = error ? `${id}-error` : null;
    const described = [errorId, helpId].filter(Boolean).join(' ') || undefined;
    // The app styles every control without a dir attribute as RTL.
    return <div className={`lw-signingCompose__field ${className}`.trim()}>
        <label htmlFor={id}>{label}</label>
        {React.cloneElement(children, { id, dir: children.props.dir || direction, 'aria-invalid': error ? true : undefined, 'aria-describedby': described })}
        {error && <small id={errorId} className="lw-signingCompose__fieldError">{t(`signingV2.compose.rowErrors.${error}`, { defaultValue: t('signingV2.compose.rowErrors.INVALID_ROW') })}</small>}
        {help && <small id={helpId}>{help}</small>}
    </div>;
}

function SuggestField({ id, label, value, error, errorText, dir, type, inputMode, maxLength, suggestLawyers, onValue, onPick }) {
    const [results, setResults] = useState([]);
    const [busy, setBusy] = useState(false);
    const timer = useRef(null);
    useEffect(() => () => clearTimeout(timer.current), []);
    const search = next => {
        onValue(next);
        clearTimeout(timer.current);
        const query = String(next || '').trim();
        timer.current = setTimeout(async () => {
            setBusy(true);
            try {
                const data = await signingTemplatesApi.contacts(query, suggestLawyers ? 'lawyer' : 'client');
                setResults(Array.isArray(data?.contacts) ? data.contacts : []);
            } catch { setResults([]); } finally { setBusy(false); }
        }, 150);
    };
    return <div className="lw-signingCompose__field">
        <SearchInput id={id} title={label} aria-label={label} type={type} inputMode={inputMode} maxLength={maxLength}
            dir={dir} containerDir={dir} value={value} error={errorText || undefined} timeToWaitInMilli={0}
            aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined}
            acceptExternalValueWhileFocused isPerforming={busy} queryResult={results}
            getButtonTextFunction={item => [item.name, item.phone || item.email].filter(Boolean).join(' | ')}
            getSelectValueFunction={item => String(item[type === 'email' ? 'email' : type === 'tel' ? 'phone' : 'name'] || '')}
            buttonPressFunction={(_text, item) => { onPick(item); setResults([]); }} onSearch={search} />
        {errorText && <small id={`${id}-error`} className="lw-signingCompose__srError">{errorText}</small>}
    </div>;
}

function PersonFields({ scope, roleKey, person, errors, onChange, compact, suggestLawyers }) {
    const { t, direction } = useSigningLocale();
    const message = name => errors?.[name] ? t(`signingV2.compose.rowErrors.${errors[name]}`, { defaultValue: t('signingV2.compose.rowErrors.INVALID_ROW') }) : '';
    const pick = item => {
        onChange(roleKey, 'name', item?.name || '');
        onChange(roleKey, 'email', item?.email || '');
        onChange(roleKey, 'phone', item?.phone || '');
    };
    const suggest = (name, extra) => <SuggestField key={name} id={fieldId(scope, roleKey, name)} label={t(`signingV2.compose.fields.${name}`)}
        value={person[name]} error={errors?.[name]} errorText={message(name)} suggestLawyers={suggestLawyers}
        onValue={value => onChange(roleKey, name, value)} onPick={pick} {...extra} />;
    const choice = (name, first, values) => <SegmentedSwitch key={name} title={t(`signingV2.compose.fields.${name}`)} ariaLabel={t(`signingV2.compose.fields.${name}`)}
        value={person[name]} onChange={value => onChange(roleKey, name, value)}
        options={[{ value: '', label: first }, ...values.map(value => ({ value, label: t(`signingV2.compose.${name}.${value}`) }))]} />;
    return <div className={`lw-signingCompose__person${compact ? ' is-compact' : ''}`}>
        <div className="lw-signingCompose__identity">
            {suggest('name', { maxLength: 300, dir: direction })}
            {suggest('email', { type: 'email', inputMode: 'email', maxLength: 254, dir: 'ltr' })}
            {suggest('phone', { type: 'tel', inputMode: 'tel', maxLength: 20, dir: 'ltr' })}
            <Text12 className="lw-signingCompose__hint" color={colors.winter}>
                {t(suggestLawyers ? 'signingV2.compose.directoryHelp.lawyer' : 'signingV2.compose.directoryHelp.client')}
            </Text12>
        </div>
        <div className="lw-signingCompose__choices">
            {choice('channel', t('signingV2.compose.channel.auto'), ['email', 'sms', 'both'])}
        </div>
    </div>;
}

const RecipientRow = memo(function RecipientRow({ row, index, roles, errors, onChange, onRemove, canRemove }) {
    const { t, number } = useSigningLocale();
    const change = useCallback((roleKey, field, value) => onChange(row.id, roleKey, field, value), [onChange, row.id]);
    const rowNumber = number(index + 1);
    return <li className="lw-signingCompose__row">
        <fieldset aria-invalid={errors ? true : undefined}>
            <legend>{t('signingV2.compose.rows.row', { number: rowNumber })}</legend>
            {canRemove && <div className="lw-signingCompose__rowHeader">
                <SecondaryButton onPress={() => onRemove(row.id)} aria-label={t('signingV2.compose.rows.remove', { number: rowNumber })}>
                    {t('signingV2.compose.rows.removeShort')}
                </SecondaryButton>
            </div>}
            {errors?.row?.general && <p className="lw-signingCompose__fieldError" role="note">{t(`signingV2.compose.rowErrors.${errors.row.general}`, { defaultValue: t('signingV2.compose.rowErrors.INVALID_ROW') })}</p>}
            {errors?.row?.key && <p className="lw-signingCompose__fieldError" role="note">{t(`signingV2.compose.rowErrors.${errors.row.key}`, { defaultValue: t('signingV2.compose.rowErrors.INVALID_ROW') })}</p>}
            {roles.map(role => <div key={role.key} className="lw-signingCompose__roleBlock">
                {roles.length > 1 && <h4>{role.label}</h4>}
                <PersonFields scope={row.id} roleKey={role.key} person={row.recipients[role.key]} errors={errors?.[role.key]} onChange={change} suggestLawyers={role.key === 'lawyer'} compact />
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
    const [filter, setFilter] = useState('');
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
    const needle = filter.trim().toLocaleLowerCase();
    const legacy = (catalog?.legacy || []).filter(item => !needle || item.name.toLocaleLowerCase().includes(needle));
    return <div className="lw-signingCompose__templates">
        {error && <StatusNotice embedded onAction={load} actionLabel={t('common.retry')}><p>{errorMessage(error)}</p></StatusNotice>}
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
                {catalog.legacy.length > 6 && <Field id="compose-legacy-filter" className="is-wide" label={t('signingV2.compose.template.filter')}>
                    <input type="search" value={filter} autoComplete="off" onChange={event => setFilter(event.target.value)} />
                </Field>}
                {needle && <p className="lw-signingPackages__caption" aria-live="polite">{t('signingV2.compose.template.matches', { count: legacy.length, formattedCount: number(legacy.length) })}</p>}
                <ul>{legacy.map(item => <li key={item.id}>
                    <span><strong>{item.name}</strong>
                        <small>{t('signingV2.compose.template.version', { version: number(item.version) })} · {t('signingV2.compose.template.documents', { count: item.documentCount, formattedCount: number(item.documentCount) })} · {item.roles.map(role => role.label).join(' · ')}</small></span>
                    <SecondaryButton onPress={() => convert(item)} disabled={!!converting} aria-busy={converting === item.id}
                        aria-label={converting === item.id ? undefined : t('signingV2.compose.template.convertNamed', { name: item.name, version: number(item.version) })}>
                        {converting === item.id ? t('signingV2.compose.template.converting') : t('signingV2.compose.template.convert')}
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
    const [omitted, setOmitted] = useState(() => new Set());
    const [source, setSource] = useState('manual');
    const [importNote, setImportNote] = useState(null);
    const [check, setCheck] = useState(null);
    const [busy, setBusy] = useState(null);
    const [error, setError] = useState(null);
    const [result, setResult] = useState(null);
    const [leaving, setLeaving] = useState(false);
    const createKey = useRef(null);
    const creating = useRef(false);

    // Stable arrays keep memoized rows from re-rendering on every keystroke with 200 rows.
    const shareRoles = useMemo(() => template ? template.roles.filter(role => role.audience === 'shared') : [], [template]);
    const eachRoles = useMemo(() => template ? template.roles.filter(role => role.audience !== 'shared') : [], [template]);
    const activeShare = useMemo(() => shareRoles.filter(role => !omitted.has(role.key)), [shareRoles, omitted]);
    const activeEach = useMemo(() => eachRoles.filter(role => !omitted.has(role.key)), [eachRoles, omitted]);
    const dirty = rows.some(rowFilled) || Object.values(shared).some(filled) || !!name.trim();

    const pendingFocus = useRef(null);
    useEffect(() => { heading.current?.focus(); }, [step]);
    useEffect(() => {
        if (!pendingFocus.current) return;
        document.getElementById(pendingFocus.current)?.focus();
        pendingFocus.current = null;
    }, [rows]);
    const invalidate = () => { setCheck(null); createKey.current = null; };

    const chooseTemplate = selected => {
        if (selected.versionId === template?.versionId) return;
        const roles = selected.roles.filter(role => role.audience !== 'shared');
        setTemplate(selected);
        setShared(Object.fromEntries(selected.roles.filter(role => role.audience === 'shared').map(role => [role.key, blankPerson()])));
        setRows([blankRow(roles)]);
        setOmitted(new Set());
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

    const omitSigner = key => {
        setOmitted(current => {
            if (!template || template.roles.length - current.size <= 1 || current.has(key)) return current;
            const next = new Set(current);
            next.add(key);
            return next;
        });
        invalidate();
    };
    const restoreSigner = key => {
        setOmitted(current => {
            if (!current.has(key)) return current;
            const next = new Set(current);
            next.delete(key);
            return next;
        });
        invalidate();
    };
    const payload = () => {
        const keptEach = new Set(activeEach.map(role => role.key));
        const sent = keptEach.size ? rows.filter(row => row.key.trim() || [...keptEach].some(key => filled(row.recipients[key]))) : rows.slice(0, 1);
        const people = recipients => Object.fromEntries(Object.entries(recipients).filter(([key]) => keptEach.has(key)).map(([key, person]) => [key, clean(person, language)]));
        return {
            sentIds: sent.map(row => row.id),
            body: {
                templateVersionId: template.versionId, name: name.trim(),
                omittedRoles: [...omitted].sort(),
                shared: Object.fromEntries(activeShare.map(role => [role.key, clean(shared[role.key] || blankPerson(), language)])),
                rows: sent.map(row => ({ ...(row.key.trim() ? { key: row.key.trim() } : {}), recipients: people(row.recipients) })),
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
        const sentKey = parts[0] === 'rows' ? check.body.rows[Number(parts[1])]?.key : null;
        const where = parts[0] === 'shared' ? roleLabel(parts[1])
            : parts.length >= 2 ? t('signingV2.compose.rows.row', { number: number(Number(parts[1]) + 1) }) + (sentKey ? ` (${sentKey})` : '')
                + (parts[2] && parts[2] !== 'key' && eachRoles.length > 1 ? ` · ${roleLabel(parts[2])}` : '') : '';
        return { where, fieldLabel, message: t(`signingV2.compose.rowErrors.${item.code}`, { defaultValue: t('signingV2.compose.rowErrors.INVALID_ROW') }),
            target: parts[0] === 'shared' ? fieldId('shared', parts[1], field) : check.sentIds[Number(parts[1])] && (parts.length === 4 ? fieldId(check.sentIds[Number(parts[1])], parts[2], field) : fieldId(check.sentIds[Number(parts[1])], eachRoles[0]?.key, 'name')) };
    };
    const filledRows = rows.filter(rowFilled).length;
    const preview = check?.preview;
    const sharedNames = preview?.shared?.map(item => item.name).join(', ');

    return <section className="lw-signingPackages lw-signingCompose" dir={direction} aria-labelledby="signing-compose-title">
        <header className="lw-signingPackages__heading">
            <div>
                <SecondaryButton onPress={leave}>{t('signingV2.compose.back')}</SecondaryButton>
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
        {error && <StatusNotice><p>{t(`signingV2.compose.errors.${error.code}`, { defaultValue: errorMessage(error) })}</p></StatusNotice>}

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
                <h3>{t('signingV2.compose.signers.heading')}</h3>
                <p className="lw-signingCompose__hintLine">{t('signingV2.compose.signers.help')}</p>
                <ul className="lw-signingCompose__signers">
                    {template.roles.filter(role => !omitted.has(role.key)).map(role => <li key={role.key}>
                        <span>{role.label}</span>
                        {template.roles.length - omitted.size > 1 && <SecondaryButton onPress={() => omitSigner(role.key)} aria-label={t('signingV2.compose.signers.remove', { name: role.label })}>
                            {t('signingV2.compose.rows.removeShort')}
                        </SecondaryButton>}
                    </li>)}
                </ul>
                {omitted.size > 0 && <div className="lw-signingCompose__restored">
                    <p>{t('signingV2.compose.signers.aside')}</p>
                    <ul className="lw-signingCompose__signers">
                        {template.roles.filter(role => omitted.has(role.key)).map(role => <li key={role.key}>
                            <span>{role.label}</span>
                            <SecondaryButton onPress={() => restoreSigner(role.key)} aria-label={t('signingV2.compose.signers.restore', { name: role.label })}>
                                {t('signingV2.compose.signers.restoreShort')}
                            </SecondaryButton>
                        </li>)}
                    </ul>
                </div>}
            </SimpleCard>
            {activeShare.length > 0 && <SimpleCard className="lw-signingCompose__card">
                <h2>{t('signingV2.compose.shared.heading')}</h2>
                <p>{t('signingV2.compose.shared.help')}</p>
                {activeShare.map(role => <fieldset key={role.key} className="lw-signingCompose__shared">
                    <legend>{role.label}</legend>
                    <PersonFields scope="shared" roleKey={role.key} person={shared[role.key] || blankPerson()} errors={check?.indexed.shared[role.key]} onChange={changeShared} suggestLawyers={role.key === 'lawyer'} />
                </fieldset>)}
            </SimpleCard>}
            {activeEach.length > 0 && <SimpleCard className="lw-signingCompose__card">
                <div className="lw-signingCompose__rowsHeading">
                    <div>
                        <h2>{t('signingV2.compose.rows.heading')}</h2>
                        <p>{t('signingV2.compose.rows.help', { roles: activeEach.map(role => role.label).join(' · '), max: number(MAX_ROWS) })}</p>
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
                {errorCount > 0 && <StatusNotice className="lw-signingCompose__errorSummary" tabIndex={-1} ref={errorSummary} aria-labelledby="compose-errors-title">
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
                </StatusNotice>}
                {activeEach.length > 0 && <ol className="lw-signingCompose__rows">{rows.map((row, index) =>
                    <RecipientRow key={row.id} row={row} index={index} roles={activeEach} errors={check?.indexed.byRow[row.id]} onChange={changeRow} onRemove={removeRow} canRemove={rows.length > 1} />)}
                </ol>}
                <div className="lw-signingPackages__actions">
                    <SecondaryButton onPress={() => {
                        const row = blankRow(activeEach.length ? activeEach : eachRoles);
                        pendingFocus.current = fieldId(row.id, activeEach[0]?.key, 'name');
                        setRows(current => [...current, row]); invalidate();
                    }} disabled={rows.length >= MAX_ROWS}>{t('signingV2.compose.rows.add')}</SecondaryButton>
                    <span className="lw-signingPackages__caption" aria-live="polite">{t('signingV2.compose.rows.count', { count: filledRows, formattedCount: number(filledRows), max: number(MAX_ROWS) })}</span>
                </div>
            </SimpleCard>}
            <footer className="lw-signingCompose__footer is-sticky">
                <SecondaryButton onPress={() => setStep('template')} disabled={!!busy}>{t('signingV2.compose.previous')}</SecondaryButton>
                <PrimaryButton onPress={runCheck} disabled={!!busy}>{busy === 'check' ? t('signingV2.compose.checking') : t('signingV2.compose.check')}</PrimaryButton>
            </footer>
        </>}

        {step === 'review' && preview?.valid && <>
            <SimpleCard className="lw-signingCompose__card">
                <h2>{t('signingV2.compose.review.heading')}</h2>
                <dl className="lw-signingCompose__summary">
                    <div><dt>{t('signingV2.compose.review.run')}</dt><dd><bdi>{check.body.name}</bdi></dd></div>
                    <div><dt>{t('signingV2.compose.review.template')}</dt><dd><bdi>{preview.template.name}</bdi></dd></div>
                    <div><dt>{t('signingV2.compose.review.packages')}</dt><dd><bdi>{number(preview.packageCount)}</bdi></dd></div>
                    <div><dt>{t('signingV2.compose.review.documents')}</dt><dd><bdi>{number(preview.documentCount)}</bdi></dd></div>
                    <div><dt>{t('signingV2.compose.review.recipients')}</dt><dd><bdi>{number(preview.recipientCount)}</bdi></dd></div>
                </dl>
                <h3>{t('signingV2.compose.review.documentList')}</h3>
                <ul className="lw-signingCompose__plainList">{preview.template.documents.map(item => <li key={item.key}>{item.name}</li>)}</ul>
                {preview.shared.length > 0 && <>
                    <h3>{t('signingV2.compose.shared.heading')}</h3>
                    <ul className="lw-signingCompose__plainList">{preview.shared.map(item => <li key={item.roleKey}><bdi>{roleLabel(item.roleKey)}</bdi>: <bdi>{item.name}</bdi></li>)}</ul>
                    <p className="lw-signingCompose__note">{t('signingV2.compose.review.sharedInvitations', { name: sharedNames, count: preview.packageCount, formattedCount: number(preview.packageCount) })}</p>
                </>}
                {omitted.size > 0 && <p className="lw-signingCompose__note">{t('signingV2.compose.signers.review', { names: template.roles.filter(role => omitted.has(role.key)).map(role => role.label).join(', ') })}</p>}
                <h3>{t('signingV2.compose.review.sample', { count: preview.sample.length, formattedCount: number(preview.sample.length) })}</h3>
                <ul className="lw-signingCompose__plainList">{preview.sample.map(item => <li key={item.key}>
                    {item.recipients.map((person, index) => <React.Fragment key={person.roleKey}>{index > 0 && ' · '}
                        <bdi>{roleLabel(person.roleKey)}</bdi>: <bdi>{person.name}</bdi> ({person.channels.map(channel => t(`signingV2.compose.channel.${channel}`)).join(', ')})
                    </React.Fragment>)}
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
