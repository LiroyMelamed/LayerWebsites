import SigningBackButton from './SigningBackButton';
import { ChevronUp, ChevronDown, GripVertical } from 'lucide-react';
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
import BlockDateInput from '../../../components/simpleComponents/BlockDateInput';
import useSigningLocale from './useSigningLocale';
import documentDataValue from './documentDataValue';
import { conditionSummary } from './templateConditions';
import { newKey } from './ParticipantActionDialog';
import StatusNotice from '../../../components/ui/StatusNotice';
import SelectedTemplateEntry from './SelectedTemplateEntry';
import WorkbookImport from './WorkbookImport';
import CaseContextPicker from './CaseContextPicker';
import ClientSendContext from './ClientSendContext';
import useSigningDraft from './useSigningDraft';
import DraftRecoveryList from './DraftRecoveryList';
import './signingPackages.scss';
import './signingCompose.scss';

const STEPS = ['template', 'recipients', 'review', 'done'];
const FIELDS = ['name', 'email', 'phone', 'channel'];
const LOCALES = new Set(['he', 'ar', 'en']);
const MAX_ROWS = 200;

let localId = 0;
const blankPerson = () => ({ name: '', email: '', phone: '', channel: '' });
const groupPeople = person => Array.isArray(person?.people) ? person.people : [person || blankPerson()];
const blankRole = role => (role.max > 1 || role.min === 0) ? { people: Array.from({ length: role.min ?? 1 }, blankPerson) } : blankPerson();
const blankRow = roles => ({ id: `row-${++localId}`, key: '', recipients: Object.fromEntries(roles.map(role => [role.key, blankRole(role)])) });
const filled = person => Array.isArray(person?.people) ? person.people.some(filled) : !!person?.sameAsRole || FIELDS.some(field => String(person?.[field] || '').trim());
const dataFilled = row => Object.values(row.data || {}).some(value => value !== '' && value != null);
const rowFilled = row => row.key.trim() || Object.values(row.recipients).some(filled) || dataFilled(row);
const clean = (person, language) => Array.isArray(person?.people) ? { people: person.people.map(item => clean(item, language)) } : person.sameAsRole ? { sameAsRole: person.sameAsRole, ...(person.sameAsOccurrence != null ? { sameAsOccurrence: person.sameAsOccurrence } : {}) } : ({
    name: String(person.name || '').trim(), email: String(person.email || '').trim(), phone: String(person.phone || '').trim(),
    ...(person.channel ? { channel: person.channel } : {}),
    locale: LOCALES.has(language) ? language : 'he',
});
function sharedIdentityKey(people, roleKey, occurrence = 0) {
    if (Array.isArray(people?.[roleKey]?.people)) return `${roleKey}:${occurrence}`;
    const visited = new Set();
    let key = roleKey;
    while (people?.[key]?.sameAsRole && !visited.has(key)) { visited.add(key); key = people[key].sameAsRole; }
    return people?.[key]?.personId || key;
}
const fieldId = (scope, roleKey, field) => `compose-${scope}-${roleKey}-${field}`;

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
    const searchGeneration = useRef(0);
    useEffect(() => () => { searchGeneration.current += 1; clearTimeout(timer.current); }, []);
    const search = next => {
        onValue(next);
        const generation = ++searchGeneration.current;
        setResults([]);
        clearTimeout(timer.current);
        const query = String(next || '').trim();
        timer.current = setTimeout(async () => {
            setBusy(true);
            try {
                const data = await signingTemplatesApi.contacts(query, suggestLawyers ? 'lawyer' : 'client');
                if (generation === searchGeneration.current) setResults(Array.isArray(data?.contacts) ? data.contacts : []);
            } catch { if (generation === searchGeneration.current) setResults([]); } finally { if (generation === searchGeneration.current) setBusy(false); }
        }, 150);
    };
    return <div className="lw-signingCompose__field">
        <SearchInput id={id} title={label} aria-label={label} type={type} inputMode={inputMode} maxLength={maxLength}
            dir={dir} containerDir={dir} value={value} error={errorText || undefined} timeToWaitInMilli={0}
            aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined}
            acceptExternalValueWhileFocused isPerforming={busy} queryResult={results}
            getButtonTextFunction={item => [item.name, item.phone || item.email].filter(Boolean).join(' | ')}
            getSelectValueFunction={item => String(item[type === 'email' ? 'email' : type === 'tel' ? 'phone' : 'name'] || '')}
            buttonPressFunction={(_text, item) => { searchGeneration.current += 1; clearTimeout(timer.current); onPick(item); setResults([]); setBusy(false); }} onSearch={search} />
        {errorText && <small id={`${id}-error`} className="lw-signingCompose__srError">{errorText}</small>}
    </div>;
}

function PersonFields({ scope, roleKey, person, errors, onChange, compact, suggestLawyers, casePeople, peopleLabel, otherRoles = [] }) {
    const { t, direction, number } = useSigningLocale();
    const choices = otherRoles.flatMap(role => Array.from({ length: role.max ?? 1 }, (_, index) => ({ key: role.key, occurrence: index, value: role.max > 1 ? `${role.key}|${index}` : role.key, label: role.max > 1 ? `${role.label} · ${number(index + 1)}` : role.label })));
    const linkedValue = person.sameAsRole ? (person.sameAsOccurrence != null ? `${person.sameAsRole}|${person.sameAsOccurrence}` : person.sameAsRole) : '';
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
        {(otherRoles.length > 0 || person.sameAsRole) && <Field id={fieldId(scope, roleKey, 'sameAsRole')}
            label={t('signingV2.compose.identity.label')} error={errors?.sameAsRole} className="is-wide">
            <select value={linkedValue} onChange={event => { const [key, index] = event.target.value.split('|'); onChange(roleKey, 'sameAsRole', key); onChange(roleKey, 'sameAsOccurrence', index == null ? undefined : Number(index)); }}>
                <option value="">{t('signingV2.compose.identity.separate')}</option>
                {person.sameAsRole && !choices.some(role => role.value === linkedValue) && <option value={linkedValue}>{t('signingV2.compose.identity.unavailable')}</option>}
                {choices.map(role => <option key={role.value} value={role.value}>{t('signingV2.compose.identity.sameAs', { role: role.label })}</option>)}
            </select>
        </Field>}
        {person.sameAsRole ? <p className="lw-signingCompose__hintLine">{t('signingV2.compose.identity.linkedHelp')}</p> : <>
        {!!casePeople?.length && <Field id={fieldId(scope, roleKey, 'case-person')} label={peopleLabel || t('signingV2.compose.context.fill')} className="is-wide">
            <select value="" onChange={event => { const item = casePeople.find(candidate => String(candidate.id) === event.target.value); if (item) pick(item); }}>
                <option value="">{t('signingV2.compose.context.choose')}</option>
                {casePeople.map(item => <option key={item.id} value={item.id}>{item.name} · {item.email || item.phone || t('signingV2.compose.context.noContact')}</option>)}
            </select>
        </Field>}
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
        </>}
    </div>;
}

// Extra people are explicit, fixed template positions. Removing only the last
// position cannot silently move another person's signature into a different slot.
function RolePeople({ role, person, onChange, errors, ...props }) {
    const { t, number } = useSigningLocale();
    if ((role.max ?? 1) === 1 && (role.min ?? 1) === 1 && !Array.isArray(person?.people)) return <PersonFields {...props} roleKey={role.key} person={person} errors={errors} onChange={onChange} />;
    const people = groupPeople(person);
    const replace = next => onChange(role.key, '__group', { people: next });
    return <div className="lw-signingCompose__people">
        <p>{t((role.min ?? 1) === (role.max ?? 1) ? 'signingV2.people.countFixed' : 'signingV2.people.countRange', { count: role.max ?? 1, formattedCount: number(role.max ?? 1), minimum: number(role.min ?? 1), maximum: number(role.max ?? 1) })}</p>
        {people.map((item, index) => <fieldset key={index} className="lw-signingCompose__personSlot">
            <legend>{t('signingV2.people.personNumber', { number: number(index + 1) })}</legend>
            <PersonFields {...props} scope={`${props.scope}-${index}`} roleKey={role.key} person={item} errors={errors?.people?.[index]} onChange={(_key, field, value) => onChange(role.key, `people.${index}.${field}`, value)} />
            {index === people.length - 1 && people.length > (role.min ?? 1) && <SecondaryButton onPress={() => replace(people.slice(0, -1))}>{t('signingV2.people.removeLast')}</SecondaryButton>}
        </fieldset>)}
        {people.length < (role.max ?? 1) && <SecondaryButton onPress={() => replace([...people, blankPerson()])}>{t('signingV2.people.add', { role: role.label })}</SecondaryButton>}
        {errors?.general && <p role="alert">{t(`signingV2.compose.rowErrors.${errors.general}`, { defaultValue: t('signingV2.compose.rowErrors.INVALID_ROW') })}</p>}
    </div>;
}

function changePerson(person, field, value) {
    if (field === '__group') return value;
    if (field.startsWith('people.')) {
        const [, index, key] = field.split('.');
        return { people: groupPeople(person).map((item, position) => position === Number(index) ? { ...item, [key]: value } : item) };
    }
    return { ...person, [field]: value };
}

function DocumentDataFields({ row, fields, errors, onChange }) {
    const { t, direction } = useSigningLocale();
    if (!fields.length) return null;
    return <div className="lw-signingCompose__roleBlock">
        <h4>{t('signingV2.compose.data.heading')}</h4>
        <p>{t('signingV2.compose.data.help')}</p>
        <div className="lw-signingCompose__identity">{fields.map(field => {
            const value = Object.hasOwn(row.data || {}, field.key) ? row.data[field.key] ?? '' : field.defaultValue ?? '';
            const change = next => onChange(row.id, field.key, next);
            if (field.type === 'date') return <div key={field.key} id={fieldId(row.id, 'data', field.key)}
                role="group" aria-label={field.label || field.key} aria-describedby={errors?.[field.key] ? `${fieldId(row.id, 'data', field.key)}-error` : undefined}>
                <BlockDateInput title={`${field.label || field.key}${field.required ? ` (${t('signingV2.compose.mapping.required')})` : ''}`}
                    value={value} onChange={event => change(event.target.value)} containerDir={direction}
                    error={errors?.[field.key] ? t(`signingV2.compose.rowErrors.${errors[field.key]}`) : null} />
                {errors?.[field.key] && <small id={`${fieldId(row.id, 'data', field.key)}-error`} className="lw-signingCompose__srError">{t(`signingV2.compose.rowErrors.${errors[field.key]}`)}</small>}
            </div>;
            return <Field key={field.key} id={fieldId(row.id, 'data', field.key)}
                label={`${field.label || field.key}${field.required ? ` (${t('signingV2.compose.mapping.required')})` : ''}`}
                error={errors?.[field.key]} help={field.type === 'decimal' ? t('signingV2.compose.data.decimalHelp') : undefined}>
                {field.type === 'boolean' || field.type === 'enum' ? <select value={String(value)} onChange={event => change(field.type === 'boolean' && event.target.value !== '' ? event.target.value === 'true' : event.target.value)}>
                    <option value="">{t('signingV2.compose.data.choose')}</option>
                    {(field.type === 'boolean' ? [true, false] : field.options).map(option => <option key={String(option)} value={String(option)}>
                        {field.type === 'boolean' ? t(`signingV2.compose.data.${option ? 'yes' : 'no'}`) : option}
                    </option>)}
                </select> : <input type="text" value={value} maxLength={field.maxLength || 2000}
                    inputMode={field.type === 'decimal' ? 'decimal' : undefined} dir={['date', 'decimal', 'identifier'].includes(field.type) ? 'ltr' : direction}
                    onChange={event => change(event.target.value)} autoComplete="off" />}
            </Field>;
        })}</div>
    </div>;
}

const RecipientRow = memo(function RecipientRow({ row, index, roles, errors, onChange, onRemove, canRemove, casePeople, peopleLabel, allRoles, dataFields, onDataChange }) {
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
                <RolePeople scope={row.id} role={role} person={row.recipients[role.key] || blankRole(role)} errors={errors?.[role.key]} onChange={change} suggestLawyers={role.key === 'lawyer'} compact casePeople={casePeople} peopleLabel={peopleLabel} otherRoles={allRoles.filter(other => other.key !== role.key)} />
            </div>)}
            <DocumentDataFields row={row} fields={dataFields} errors={errors?.data} onChange={onDataChange} />
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
            const imported = await api.importLegacy(legacy.id, language, legacy.version);
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
        if (parts[0] === 'shared') { const entry = shared[parts[1]] ||= {}; if (parts[2] === 'people') ((entry.people ||= {})[parts[3]] ||= {})[parts[4]] = error.code; else entry[parts[2] || 'general'] = error.code; continue; }
        if (parts[0] !== 'rows' || parts.length < 2) continue;
        const id = sentIds[Number(parts[1])];
        if (!id) continue;
        const entry = byRow[id] ||= {};
        if (parts[2] === 'key') (entry.row ||= {}).key = error.code;
        else if (parts.length === 2) (entry.row ||= {}).general = error.code;
        else if (parts[3] === 'people') (((entry[parts[2]] ||= {}).people ||= {})[parts[4]] ||= {})[parts[5]] = error.code;
        else (entry[parts[2]] ||= {})[parts[3] || 'general'] = error.code;
    }
    return { byRow, shared };
}

function SigningOrderFields({ mode, roles, groups, onMode, onMove, onGroup }) {
    const { t, number } = useSigningLocale();
    const drag = useRef(null);
    return <fieldset className="lw-signingCompose__order">
        <legend>{t('signing.upload.signingOrderLabel')}</legend>
        <label className="lw-signingCompose__radio">
            <input type="radio" name="signingOrder" checked={mode === 'parallel'} onChange={() => onMode('parallel')} />
            {t('signing.upload.signingOrderParallel')}
        </label>
        <label className="lw-signingCompose__radio">
            <input type="radio" name="signingOrder" checked={mode === 'sequential'} onChange={() => onMode('sequential')} />
            {t('signing.upload.signingOrderSequential')}
        </label>
        <label className="lw-signingCompose__radio">
            <input type="radio" name="signingOrder" checked={mode === 'grouped'} onChange={() => onMode('grouped')} />
            {t('signingV2.compose.order.grouped')}
        </label>
        {mode === 'grouped' && <div className="lw-signingCompose__groupedOrder">
            <p>{t('signingV2.compose.order.groupHelp')}</p>
            <div className="lw-signingCompose__identity">{roles.map(role => <Field key={role.key} id={`signing-stage-${role.key}`}
                label={t('signingV2.compose.order.stageFor', { name: role.label })}>
                <select value={groups.findIndex(group => group.includes(role.key))} onChange={event => onGroup(role.key, Number(event.target.value))}>
                    {groups.map((_, index) => <option key={index} value={index}>{t('signingV2.compose.order.stage', { number: number(index + 1) })}</option>)}
                    {groups.length < roles.length && <option value={groups.length}>{t('signingV2.compose.order.newStage')}</option>}
                </select>
            </Field>)}</div>
            <StageSummary groups={groups} roles={roles} />
        </div>}
        {mode === 'sequential' && roles.length >= 2 && <div className="lw-signingCompose__orderList">
            <p>{t('signing.upload.sequentialOrderTitle')}</p>
            <ol>
                {roles.map((role, index) => <li key={role.key} draggable
                    onDragStart={() => { drag.current = index; }}
                    onDragOver={event => event.preventDefault()}
                    onDrop={() => { if (drag.current != null && drag.current !== index) onMove(drag.current, index); drag.current = null; }}>
                    <GripVertical className="lw-signingCompose__orderHandle" size={18} aria-hidden="true" />
                    <span className="lw-signingCompose__orderNum">{number(index + 1)}</span>
                    <span className="lw-signingCompose__orderName">{role.label}</span>
                    <button type="button" disabled={index === 0} aria-label={t('signingV2.compose.order.up', { name: role.label })} onClick={() => onMove(index, index - 1)}><ChevronUp size={18} aria-hidden="true" /></button>
                    <button type="button" disabled={index === roles.length - 1} aria-label={t('signingV2.compose.order.down', { name: role.label })} onClick={() => onMove(index, index + 1)}><ChevronDown size={18} aria-hidden="true" /></button>
                </li>)}
            </ol>
        </div>}
    </fieldset>;
}

function StageSummary({ groups, roles }) {
    const { t, number } = useSigningLocale();
    return <ol className="lw-signingCompose__plainList lw-signingCompose__stageSummary">{groups.map((group, index) => <li key={index}>
        <strong>{t('signingV2.compose.order.stage', { number: number(index + 1) })}</strong>: {' '}
        {group.map((key, position) => <React.Fragment key={key}>{position > 0 && ' · '}<bdi>{roles.find(role => role.key === key)?.label}</bdi></React.Fragment>)}
    </li>)}</ol>;
}

function templateOrder(roles) {
    const ordered = [...roles].sort((a, b) => (a.stage ?? 0) - (b.stage ?? 0));
    const stages = [...new Set(ordered.map(role => role.stage ?? 0))];
    const groups = stages.map(stage => ordered.filter(role => (role.stage ?? 0) === stage).map(role => role.key));
    return {
        mode: groups.length <= 1 ? 'parallel' : groups.some(group => group.length > 1) ? 'grouped' : 'sequential',
        roles: ordered.map(role => role.key), groups,
    };
}

export default function PackageComposer({ api = signingPackagesApi, onBack, onCreated, initialTemplateId, initialTemplateVersion, initialCaseId, initialClientId, backLabel }) {
    const { t, direction, number, language, errorMessage, locale } = useSigningLocale();
    const heading = useRef(null);
    const errorSummary = useRef(null);
    const [step, setStep] = useState(initialTemplateId ? 'opening' : 'template');
    const [replacement, setReplacement] = useState(null);
    const [template, setTemplate] = useState(null);
    const [name, setName] = useState('');
    const [shared, setShared] = useState({});
    const [roleAudience, setRoleAudience] = useState({});
    const [rows, setRows] = useState([]);
    const [omitted, setOmitted] = useState(() => new Set());
    const [orderMode, setOrderMode] = useState('parallel');
    const [orderRoles, setOrderRoles] = useState([]);
    const [orderGroups, setOrderGroups] = useState([]);
    const [source, setSource] = useState('manual');
    const [importNote, setImportNote] = useState(null);
    const [check, setCheck] = useState(null);
    const [busy, setBusy] = useState(null);
    const [error, setError] = useState(null);
    const [result, setResult] = useState(null);
    const [leaving, setLeaving] = useState(false);
    const [caseContext, setCaseContext] = useState(null);
    const [casePending, setCasePending] = useState(!!initialCaseId);
    const [caseRestored, setCaseRestored] = useState(false);
    const [clientContext, setClientContext] = useState(null);
    const [clientPending, setClientPending] = useState(!!initialClientId);
    const [clientRestored, setClientRestored] = useState(false);
    const contextPeople = useMemo(() => [...new Map([...(caseContext?.people || []), ...(clientContext ? [clientContext] : [])].map(person => [person.id, person])).values()], [caseContext, clientContext]);
    const peopleLabel = clientContext ? t('signingV2.compose.clientContext.fill') : undefined;
    const createKey = useRef(null);
    const creating = useRef(false);
    const checking = useRef(false);
    const inputGeneration = useRef(0);

    // Stable arrays keep memoized rows from re-rendering on every keystroke with 200 rows.
    const sendRoles = useMemo(() => (template?.roles || []).map(role => ({ ...role, audience: Object.hasOwn(roleAudience, role.key) ? roleAudience[role.key] : role.audience })), [template, roleAudience]);
    const shareRoles = useMemo(() => sendRoles.filter(role => role.audience === 'shared'), [sendRoles]);
    const eachRoles = useMemo(() => sendRoles.filter(role => role.audience !== 'shared'), [sendRoles]);
    const activeRoles = useMemo(() => sendRoles.filter(role => !omitted.has(role.key)), [sendRoles, omitted]);
    const activeShare = useMemo(() => shareRoles.filter(role => !omitted.has(role.key)), [shareRoles, omitted]);
    const activeEach = useMemo(() => eachRoles.filter(role => !omitted.has(role.key)), [eachRoles, omitted]);
    const dataFields = useMemo(() => template?.dataKeys || [], [template]);
    const editingData = useRef({ rows, dataFields });
    editingData.current = { rows, dataFields };
    const dirty = rows.some(rowFilled) || Object.values(shared).some(filled) || !!name.trim();

    const pendingFocus = useRef(null);
    useEffect(() => { heading.current?.focus(); }, [step]);
    useEffect(() => {
        if (!pendingFocus.current) return;
        document.getElementById(pendingFocus.current)?.focus();
        pendingFocus.current = null;
    }, [rows]);
    const invalidate = () => { inputGeneration.current += 1; setCheck(null); createKey.current = null; };

    const applyTemplate = selected => {
        if (selected.versionId === template?.versionId) return;
        const roles = selected.roles.filter(role => role.audience !== 'shared');
        const order = templateOrder(selected.roles);
        setTemplate(selected);
        setRoleAudience({});
        setShared(Object.fromEntries(selected.roles.filter(role => role.audience === 'shared').map(role => [role.key, blankRole(role)])));
        setRows([blankRow(roles)]);
        setOmitted(new Set());
        setOrderMode(order.mode);
        setOrderRoles(order.roles); setOrderGroups(order.groups);
        setName(current => current || selected.name);
        setImportNote(null); invalidate();
    };
    const chooseTemplate = selected => {
        if (selected.versionId === template?.versionId) return;
        if (template && (rows.some(rowFilled) || Object.values(shared).some(filled))) { setReplacement(selected); return; }
        applyTemplate(selected);
    };
    const changeRow = useCallback((rowId, roleKey, field, value) => {
        setRows(current => current.map(row => {
            if (row.id !== rowId) return row;
            if (!roleKey) return { ...row, [field]: value };
            return { ...row, recipients: { ...row.recipients, [roleKey]: changePerson(row.recipients[roleKey], field, value) } };
        }));
        inputGeneration.current += 1; setCheck(null); createKey.current = null;
    }, []);
    const changeData = useCallback((rowId, key, value) => {
        const current = editingData.current, row = current.rows.find(item => item.id === rowId);
        if (!row) return;
        const previous = Object.hasOwn(row.data || {}, key) ? row.data[key] : current.dataFields.find(field => field.key === key)?.defaultValue;
        // The incumbent date control commits again on blur. An unchanged value
        // must not erase a review that completed while focus was moving.
        if ((previous ?? '') === value) return;
        setRows(current => current.map(row => row.id === rowId ? { ...row, data: { ...row.data, [key]: value }, dataSources: { ...row.dataSources, [key]: 'manual' } } : row));
        inputGeneration.current += 1; setCheck(null); createKey.current = null;
    }, []);
    const removeRow = useCallback(rowId => { setRows(current => current.filter(row => row.id !== rowId)); inputGeneration.current += 1; setCheck(null); createKey.current = null; }, []);
    const changeShared = useCallback((roleKey, field, value) => {
        setShared(current => ({ ...current, [roleKey]: changePerson(current[roleKey], field, value) }));
        inputGeneration.current += 1; setCheck(null); createKey.current = null;
    }, []);

    const layout = () => ({ ...(Object.keys(roleAudience).length ? { roleAudience } : {}), ...(omitted.size ? { omittedRoles: [...omitted] } : {}) });
    const downloadWorkbook = async () => {
        setBusy('download'); setError(null);
        try {
            const blob = await api.workbook(template.versionId, language, layout());
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url; link.download = `${template.name}.xlsx`;
            document.body.appendChild(link); link.click(); link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (failure) { setError(failure); } finally { setBusy(null); }
    };
    const applyWorkbook = parsed => {
        const imported = parsed.rows.map(row => ({ id: `row-${++localId}`, key: row.key || '',
            ...(row.data ? { data: row.data, dataSources: row.dataSources } : {}),
            recipients: Object.fromEntries(eachRoles.map(role => [role.key, { ...blankPerson(), ...row.recipients[role.key] }])) }));
        setRows(imported); setImportNote({ count: imported.length, issues: parsed.errors }); invalidate();
    };
    const importPending = useCallback(pending => setBusy(pending ? 'upload' : null), []);

    const omitSigner = key => {
        setOmitted(current => {
            if (!template || template.roles.length - current.size <= 1 || current.has(key)) return current;
            const next = new Set(current);
            next.add(key);
            return next;
        });
        setOrderRoles(current => current.filter(item => item !== key));
        setOrderGroups(current => current.map(group => group.filter(item => item !== key)).filter(group => group.length));
        invalidate();
    };
    const restoreSigner = key => {
        setOmitted(current => {
            if (!current.has(key)) return current;
            const next = new Set(current);
            next.delete(key);
            return next;
        });
        setOrderRoles(current => current.includes(key) ? current : [...current, key]);
        setOrderGroups(current => current.some(group => group.includes(key)) ? current : [...current, [key]]);
        invalidate();
    };
    const moveRole = (from, to) => {
        setOrderRoles(current => {
            const visible = current.filter(key => !omitted.has(key));
            if (to < 0 || to >= visible.length || from === to) return current;
            const next = [...visible];
            const [item] = next.splice(from, 1);
            next.splice(to, 0, item);
            return next;
        });
        invalidate();
    };
    const orderedRoles = orderRoles.map(key => template?.roles.find(role => role.key === key)).filter(role => role && !omitted.has(role.key));
    const activeGroups = orderGroups.map(group => group.filter(key => !omitted.has(key))).filter(group => group.length);
    const changeOrderMode = mode => {
        if (mode === 'grouped') setOrderGroups(orderMode === 'sequential' ? orderedRoles.map(role => [role.key]) : [orderedRoles.map(role => role.key)]);
        setOrderMode(mode); invalidate();
    };
    const changeGroup = (key, stage) => {
        setOrderGroups(current => {
            const groups = current.map(group => group.filter(item => item !== key));
            (groups[stage] ||= []).push(key);
            return groups.filter(group => group.length);
        });
        invalidate();
    };
    const payload = () => {
        const keptEach = new Set(activeEach.map(role => role.key));
        const candidates = rows.filter(row => row.key.trim() || dataFilled(row) || [...keptEach].some(key => filled(row.recipients[key])));
        const sent = keptEach.size || dataFields.length ? (candidates.length ? candidates : keptEach.size ? [] : rows.slice(0, 1)) : rows.slice(0, 1);
        const people = recipients => Object.fromEntries(Object.entries(recipients).filter(([key]) => keptEach.has(key)).map(([key, person]) => [key, clean(person, language)]));
        return {
            sentIds: sent.map(row => row.id),
            body: {
                templateVersionId: template.versionId, name: name.trim(),
                ...(caseContext ? { caseId: caseContext.id } : {}),
                ...(clientContext ? { clientId: clientContext.id } : {}),
                ...(Object.keys(roleAudience).length ? { roleAudience } : {}),
                omittedRoles: [...omitted].sort(),
                signingOrder: orderMode === 'grouped' ? { mode: 'grouped', groups: activeGroups } : orderMode === 'sequential'
                    ? { mode: 'sequential', roles: orderRoles.filter(key => !omitted.has(key)) }
                    : { mode: 'parallel' },
                shared: Object.fromEntries(activeShare.map(role => [role.key, clean(shared[role.key] || blankRole(role), language)])),
                rows: sent.map(row => ({ ...(row.key.trim() ? { key: row.key.trim() } : {}), recipients: people(row.recipients), ...(dataFields.length ? { data: row.data || {}, dataSources: row.dataSources || {} } : {}) })),
            },
        };
    };
    const draftPayload = template ? { request: payload().body, editor: {
        template, name, shared, roleAudience, rows, omitted: [...omitted], orderMode, orderRoles, orderGroups, source, importNote,
    } } : null;
    const draft = useSigningDraft({ api, payload: draftPayload, active: !!template && !casePending && !clientPending && step !== 'done',
        validateRestore: saved => {
            if ((initialClientId && String(saved?.request?.clientId) !== String(initialClientId))
                || (initialCaseId && String(saved?.request?.caseId) !== String(initialCaseId))) {
                throw Object.assign(new Error('DRAFT_CONTEXT_CHANGED'), { code: 'DRAFT_CONTEXT_CHANGED' });
            }
        },
        onSubmitted: created => { setResult(created); setStep('done'); },
        onRestore: async (saved, isCurrent) => {
            const editor = saved.editor;
            if (!editor?.template || editor.template.versionId !== saved.request.templateVersionId || !Array.isArray(editor.rows)) {
                throw Object.assign(new Error('INVALID_DRAFT'), { code: 'INVALID_DRAFT' });
            }
            const restoredCase = saved.request.caseId ? await api.caseContext(saved.request.caseId) : null;
            const restoredClient = saved.request.clientId ? await api.clientContext(saved.request.clientId) : null;
            if (!isCurrent()) return;
            setTemplate(editor.template); setName(editor.name || ''); setShared(editor.shared || {});
            setRoleAudience(editor.roleAudience || {});
            setRows(editor.rows.map(row => ({ ...row, id: `row-${++localId}` })));
            setOmitted(new Set(editor.omitted || [])); setOrderMode(editor.orderMode || 'parallel');
            setOrderGroups(editor.orderGroups || templateOrder(editor.template.roles).groups);
            setOrderRoles(editor.orderRoles || []); setSource(editor.source || 'manual'); setImportNote(editor.importNote || null);
            setClientContext(restoredClient); setClientPending(false); setClientRestored(true);
            setCaseContext(restoredCase); setCasePending(false); setCaseRestored(true); invalidate(); setStep('recipients');
        } });
    const runCheck = async () => {
        if (checking.current || casePending || clientPending) return;
        setError(null);
        const { body, sentIds } = payload();
        if (!body.name) { setError({ code: 'RUN_NAME_REQUIRED' }); return; }
        if (!body.rows.length) { setError({ code: 'ROWS_REQUIRED' }); return; }
        if (body.rows.length > MAX_ROWS) { setError({ code: 'CAPACITY_BUDGET_EXCEEDED' }); return; }
        checking.current = true;
        const generation = inputGeneration.current;
        setBusy('check');
        try {
            const preview = await api.previewCreation(body);
            if (generation !== inputGeneration.current) return;
            const next = { preview, body, sentIds, indexed: indexErrors(preview.errors || [], sentIds) };
            setCheck(next);
            if (preview.valid) { createKey.current = newKey(); setStep('review'); }
            else requestAnimationFrame(() => errorSummary.current?.focus());
        } catch (failure) { if (generation === inputGeneration.current) setError(failure); } finally { checking.current = false; setBusy(null); }
    };
    const create = async () => {
        if (creating.current || !check?.preview.valid) return;
        creating.current = true; setBusy('create'); setError(null);
        try {
            const created = draft.enabled
                ? await draft.submit({ ...draftPayload, request: check.body }, check.preview.previewHash)
                : await api.create({ ...check.body, previewHash: check.preview.previewHash }, createKey.current);
            setResult(created); setStep('done');
        } catch (failure) {
            if (failure.code === 'PREVIEW_CHANGED' || failure.code === 'INVALID_ROWS') { invalidate(); setStep('recipients'); }
            if (failure.code === 'IDEMPOTENCY_CONFLICT') createKey.current = newKey();
            setError(failure);
        } finally { creating.current = false; setBusy(null); }
    };
    const leave = async () => {
        if (draft.enabled && template && step !== 'done') {
            try { await draft.flush(); onBack?.(); } catch { setLeaving(true); }
        } else if (step !== 'done' && dirty && !leaving) setLeaving(true); else onBack?.();
    };
    const restart = () => { draft.reset(); setStep('template'); setTemplate(null); setRows([]); setShared({}); setName(''); setResult(null); setImportNote(null); invalidate(); };

    const errorCount = check && !check.preview.valid ? check.preview.errorCount : 0;
    const errorEntries = check && !check.preview.valid ? check.preview.errors : [];
    const roleLabel = key => template?.roles.find(role => role.key === key)?.label || key;
    const describeError = item => {
        const parts = item.path.split('.');
        const field = parts.at(-1);
        const fieldLabel = parts[2] === 'data' ? dataFields.find(item => item.key === field)?.label || field : FIELDS.includes(field) ? t(`signingV2.compose.fields.${field}`) : field === 'sameAsRole' ? t('signingV2.compose.identity.label') : field === 'key' ? t('signingV2.compose.rows.key') : '';
        const sentKey = parts[0] === 'rows' ? check.body.rows[Number(parts[1])]?.key : null;
        const where = parts[0] === 'shared' ? roleLabel(parts[1])
            : parts.length >= 2 ? t('signingV2.compose.rows.row', { number: number(Number(parts[1]) + 1) }) + (sentKey ? ` (${sentKey})` : '')
                + (parts[2] && !['key', 'data'].includes(parts[2]) && eachRoles.length > 1 ? ` · ${roleLabel(parts[2])}` : '') : '';
        return { where: `${where}${parts.includes('people') ? ` · ${t('signingV2.people.personNumber', { number: number(Number(parts[parts.indexOf('people') + 1]) + 1) })}` : ''}`, fieldLabel, message: t(`signingV2.compose.rowErrors.${item.code}`, { defaultValue: t('signingV2.compose.rowErrors.INVALID_ROW') }),
            target: parts.includes('people') ? fieldId(`${parts[0] === 'shared' ? 'shared' : check.sentIds[Number(parts[1])]}-${parts[parts.indexOf('people') + 1]}`, parts[0] === 'shared' ? parts[1] : parts[2], field) : parts[0] === 'shared' ? fieldId('shared', parts[1], field) : check.sentIds[Number(parts[1])] && (parts.length === 4 ? fieldId(check.sentIds[Number(parts[1])], parts[2], field) : fieldId(check.sentIds[Number(parts[1])], eachRoles[0]?.key, 'name')) };
    };
    const filledRows = rows.filter(rowFilled).length;
    const preview = check?.preview;
    const sharedNames = [...new Map((preview?.shared || []).map(item => [sharedIdentityKey(check?.body.shared, item.roleKey, item.occurrence), item.name])).values()].join(', ');

    if (draft.status === 'loading' || draft.status === 'loadError') return <section className="lw-signingPackages lw-signingCompose" dir={direction}>
        {draft.status === 'loading' ? <p role="status">{t('signingV2.compose.draft.loading')}</p> : <StatusNotice>
            <p>{t(draft.error?.code === 'DRAFT_CONTEXT_CHANGED' ? 'signingV2.compose.draft.contextChanged' : 'signingV2.compose.draft.loadError')}</p>
            <SecondaryButton onPress={() => draft.recover(draft.id)}>{t('common.retry')}</SecondaryButton>
            <SigningBackButton onPress={restart}>{t('signingV2.compose.draft.startNew')}</SigningBackButton>
        </StatusNotice>}
    </section>;

    return <section className="lw-signingPackages lw-signingCompose" dir={direction} aria-labelledby="signing-compose-title">
        <header className="lw-signingPackages__heading">
            <div>
                <SigningBackButton onPress={leave}>{backLabel || t('signingV2.compose.back')}</SigningBackButton>
                <h1 id="signing-compose-title" ref={heading} tabIndex={-1}>{t('signingV2.compose.title')}</h1>
                <p>{t('signingV2.compose.subtitle')}</p>
            </div>
        </header>
        {draft.enabled && template && step !== 'done' && <div className="lw-signingCompose__draftState">
            <p role="status">{t(`signingV2.compose.draft.${draft.status}`, { defaultValue: t('signingV2.compose.draft.pending') })}</p>
            {draft.error && <StatusNotice embedded>
                <p>{t(draft.error.code === 'DRAFT_CHANGED' || draft.error.code === 'DRAFT_ALREADY_SUBMITTED'
                    ? 'signingV2.compose.draft.changed' : 'signingV2.compose.draft.saveError')}</p>
                <SecondaryButton onPress={() => draft.flush().catch(() => {})}>{t('common.retry')}</SecondaryButton>
                <SecondaryButton onPress={() => draft.recover(draft.id)}>{t('signingV2.compose.draft.restoreServer')}</SecondaryButton>
            </StatusNotice>}
        </div>}
        {leaving && <div className="lw-signingCompose__confirm" role="alertdialog" aria-labelledby="compose-leave-title" aria-describedby="compose-leave-body">
            <strong id="compose-leave-title">{t('signingV2.compose.discardTitle')}</strong>
            <p id="compose-leave-body">{t('signingV2.compose.discardBody')}</p>
            <div className="lw-signingPackages__actions">
                <SecondaryButton onPress={() => setLeaving(false)}>{t('signingV2.compose.keepEditing')}</SecondaryButton>
                <PrimaryButton onPress={() => onBack?.()}>{t('signingV2.compose.discardConfirm')}</PrimaryButton>
            </div>
        </div>}
        <Stepper step={step === 'opening' ? 'template' : step} />
        {api.clientContext && (initialClientId || clientContext) && step !== 'done' && <SimpleCard className="lw-signingCompose__card lw-signingCompose__context" hidden={step === 'review'}>
            <ClientSendContext key={String(clientRestored)} api={api} initialClientId={clientRestored ? null : initialClientId} value={clientContext}
                onPending={value => { setClientPending(value); if (value) invalidate(); }}
                onChange={value => { setClientContext(value); invalidate(); }} />
        </SimpleCard>}
        {api.caseContext && step !== 'done' && <SimpleCard className="lw-signingCompose__card lw-signingCompose__context" hidden={step === 'review'}>
            <CaseContextPicker api={api} initialCaseId={caseRestored ? null : initialCaseId} value={caseContext} onPending={value => { setCasePending(value); if (value) invalidate(); }}
                onChange={value => { setCaseContext(value); invalidate(); }} />
        </SimpleCard>}
        {error && <StatusNotice><p>{t(`signingV2.compose.errors.${error.code}`, { defaultValue: errorMessage(error) })}</p></StatusNotice>}

        {step === 'opening' && <SimpleCard className="lw-signingCompose__card">
            <SelectedTemplateEntry api={api} templateId={initialTemplateId} expectedVersion={initialTemplateVersion}
                onReady={selected => { applyTemplate(selected); setStep('recipients'); }} onChoose={() => setStep('template')} />
        </SimpleCard>}
        {replacement && <div className="lw-signingCompose__confirm" role="alertdialog" aria-labelledby="compose-replace-title">
            <strong id="compose-replace-title">{t('signingV2.compose.template.replaceTitle')}</strong>
            <p>{t('signingV2.compose.template.replaceBody')}</p>
            <div className="lw-signingPackages__actions">
                <SecondaryButton onPress={() => setReplacement(null)}>{t('signingV2.compose.keepEditing')}</SecondaryButton>
                <PrimaryButton onPress={() => { applyTemplate(replacement); setReplacement(null); }}>{t('signingV2.compose.template.replaceConfirm')}</PrimaryButton>
            </div>
        </div>}
        {step === 'template' && <SimpleCard className="lw-signingCompose__card">
            {draft.enabled && <DraftRecoveryList api={api} onResume={draft.recover} />}
            <TemplateStep api={api} selected={template} onSelect={chooseTemplate} />
            <footer className="lw-signingCompose__footer">
                <PrimaryButton onPress={() => setStep('recipients')} disabled={!template || !!replacement}>{t('signingV2.compose.next')}</PrimaryButton>
            </footer>
        </SimpleCard>}

        {step === 'recipients' && template && <>
            <SimpleCard className="lw-signingCompose__card">
                <h2>{t('signingV2.compose.details')}</h2>
                <Field id="compose-run-name" className="is-wide" label={t('signingV2.compose.runName')} help={t('signingV2.compose.runNameHelp')}>
                    <input value={name} maxLength={300} onChange={event => { setName(event.target.value); invalidate(); }} />
                </Field>
                <p className="lw-signingPackages__caption">{t('signingV2.compose.templateSummary', { name: template.name })}</p>
                <details className="lw-signingCompose__optionalRoles"><summary>{t('signingV2.compose.signers.heading')}</summary>
                <p className="lw-signingCompose__hintLine">{t('signingV2.compose.signers.help')}</p>
                <p className="lw-signingCompose__hintLine">{t('signingV2.compose.audience.help')}</p>
                <ul className="lw-signingCompose__signers">
                    {template.roles.filter(role => !omitted.has(role.key)).map(role => <li key={role.key}>
                        <SegmentedSwitch title={role.label} ariaLabel={t('signingV2.compose.audience.label', { name: role.label })}
                            value={Object.hasOwn(roleAudience, role.key) ? roleAudience[role.key] : role.audience} onChange={value => { setRoleAudience(current => ({ ...current, [role.key]: value })); invalidate(); }}
                            options={[{ value: 'each', label: t('signingV2.compose.audience.each') }, { value: 'shared', label: t('signingV2.compose.audience.shared') }]} />
                        {template.roles.length - omitted.size > 1 && <SecondaryButton onPress={() => omitSigner(role.key)} aria-label={t('signingV2.compose.signers.remove', { name: role.label })}>
                            {t('signingV2.compose.rows.removeShort')}
                        </SecondaryButton>}
                        {role.when && <p dir="auto">{conditionSummary(role.when, dataFields, (key, values) => t(`signingV2.authoring.condition.${key}`, values))}</p>}
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
                </details>
                <SigningOrderFields mode={orderMode} roles={orderedRoles} groups={activeGroups} onMode={changeOrderMode} onMove={moveRole} onGroup={changeGroup} />
            </SimpleCard>
            {activeShare.length > 0 && <SimpleCard className="lw-signingCompose__card">
                <h2>{t('signingV2.compose.shared.heading')}</h2>
                <p>{t(activeShare.some(role => role.when) ? 'signingV2.compose.shared.conditionalHelp' : 'signingV2.compose.shared.help')}</p>
                {activeShare.map(role => <fieldset key={role.key} className="lw-signingCompose__shared">
                    <legend>{role.label}</legend>
                    <RolePeople scope="shared" role={role} person={shared[role.key] || blankRole(role)} errors={check?.indexed.shared[role.key]} onChange={changeShared} suggestLawyers={role.key === 'lawyer'} casePeople={contextPeople} peopleLabel={peopleLabel} otherRoles={activeShare.filter(other => other.key !== role.key)} />
                </fieldset>)}
            </SimpleCard>}
            {(activeEach.length > 0 || dataFields.length > 0) && <SimpleCard className="lw-signingCompose__card">
                <div className="lw-signingCompose__rowsHeading">
                    <div>
                        <h2>{t('signingV2.compose.rows.heading')}</h2>
                        <p>{activeEach.length ? t('signingV2.compose.rows.help', { roles: activeEach.map(role => role.label).join(' · '), max: number(MAX_ROWS) }) : t('signingV2.compose.data.rowsHelp')}</p>
                    </div>
                    <SegmentedSwitch value={source} onChange={setSource} ariaLabel={t('signingV2.compose.rows.source')}
                        options={[{ value: 'manual', label: t('signingV2.compose.rows.manual') }, { value: 'excel', label: t('signingV2.compose.rows.excel') }]} />
                </div>
                {source === 'excel' && <div className="lw-signingCompose__excel">
                    <ol>
                        <li>{t('signingV2.compose.excel.stepDownload')} <SecondaryButton onPress={downloadWorkbook} disabled={!!busy}>{busy === 'download' ? t('common.loading') : t('signingV2.compose.excel.download')}</SecondaryButton></li>
                        <li>{t('signingV2.compose.excel.stepFill', { max: number(MAX_ROWS) })}</li>
                    </ol>
                    <WorkbookImport key={JSON.stringify(layout())} api={api} versionId={template.versionId} roles={activeEach} dataFields={dataFields} layout={layout()}
                        hasRecipients={rows.some(rowFilled)} onApply={applyWorkbook} onPending={importPending} />
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
                            <button type="button" className="lw-signingPackages__textButton" onClick={() => { const target = document.getElementById(info.target); (target?.querySelector('input') || target)?.focus(); }}>
                                {[info.where, info.fieldLabel].filter(Boolean).join(' · ')}
                            </button>: {info.message}
                        </li>;
                    })}</ul>
                    {errorCount > 30 && <p>{t('signingV2.compose.moreErrors', { count: errorCount - 30, formattedCount: number(errorCount - 30) })}</p>}
                </StatusNotice>}
                {(activeEach.length > 0 || dataFields.length > 0) && busy !== 'upload' && <ol className="lw-signingCompose__rows">{rows.map((row, index) =>
                    <RecipientRow key={row.id} row={row} index={index} roles={activeEach} errors={check?.indexed.byRow[row.id]} onChange={changeRow} onRemove={removeRow} canRemove={rows.length > 1} casePeople={contextPeople} peopleLabel={peopleLabel} allRoles={activeRoles} dataFields={dataFields} onDataChange={changeData} />)}
                </ol>}
                <div className="lw-signingPackages__actions">
                    <SecondaryButton onPress={() => {
                        const row = blankRow(activeEach.length ? activeEach : eachRoles);
                        pendingFocus.current = activeEach.length ? fieldId(row.id, activeEach[0].key, 'name') : fieldId(row.id, 'data', dataFields[0]?.key);
                        setRows(current => [...current, row]); invalidate();
                    }} disabled={rows.length >= MAX_ROWS || busy === 'upload'}>{t('signingV2.compose.rows.add')}</SecondaryButton>
                    <span className="lw-signingPackages__caption" aria-live="polite">{t('signingV2.compose.rows.count', { count: filledRows, formattedCount: number(filledRows), max: number(MAX_ROWS) })}</span>
                </div>
            </SimpleCard>}
            <footer className="lw-signingCompose__footer is-sticky">
                <SigningBackButton onPress={() => setStep('template')} disabled={!!busy}>{t('signingV2.compose.previous')}</SigningBackButton>
                <PrimaryButton onPress={runCheck} disabled={!!busy || casePending || clientPending}>{busy === 'check' ? t('signingV2.compose.checking') : t('signingV2.compose.check')}</PrimaryButton>
            </footer>
        </>}

        {step === 'review' && preview?.valid && <>
            <SimpleCard className="lw-signingCompose__card">
                <h2>{t('signingV2.compose.review.heading')}</h2>
                <dl className="lw-signingCompose__summary">
                    <div><dt>{t('signingV2.compose.review.run')}</dt><dd><bdi>{check.body.name}</bdi></dd></div>
                    {clientContext && <div><dt>{t('signingV2.compose.clientContext.selected')}</dt><dd><bdi>{clientContext.name}</bdi></dd></div>}
                    {caseContext && <div><dt>{t('signingV2.compose.context.selected')}</dt><dd><bdi>{caseContext.name}</bdi></dd></div>}
                    <div><dt>{t('signingV2.compose.review.template')}</dt><dd><bdi>{preview.template.name}</bdi></dd></div>
                    <div><dt>{t('signingV2.compose.review.packages')}</dt><dd><bdi>{number(preview.packageCount)}</bdi></dd></div>
                    <div><dt>{t('signingV2.compose.review.documents')}</dt><dd><bdi>{number(preview.documentCount)}</bdi></dd></div>
                    <div><dt>{t('signingV2.compose.review.recipients')}</dt><dd><bdi>{number(preview.recipientCount)}</bdi></dd></div>
                </dl>
                <h3>{t('signingV2.compose.review.documentList')}</h3>
                <ul className="lw-signingCompose__plainList">{(preview.documentSummary || preview.template.documents).map(item => <li key={item.key}><bdi>{item.name}</bdi>
                    {item.excludedCount > 0 && <span> · {t('signingV2.compose.review.inclusion', { included: number(item.includedCount), total: number(preview.packageCount), excluded: number(item.excludedCount) })}</span>}
                </li>)}</ul>
                {!!preview.roleSummary?.some(item => item.excludedCount > 0) && <>
                    <h3>{t('signingV2.compose.review.conditionalRoles')}</h3>
                    <ul className="lw-signingCompose__plainList">{preview.roleSummary.filter(item => item.excludedCount > 0).map(item => <li key={item.key}>
                        <bdi>{item.label}</bdi> · {t('signingV2.compose.review.inclusion', { included: number(item.includedCount), total: number(preview.packageCount), excluded: number(item.excludedCount) })}
                    </li>)}</ul>
                </>}
                {preview.shared.length > 0 && <>
                    <h3>{t('signingV2.compose.shared.heading')}</h3>
                    <ul className="lw-signingCompose__plainList">{preview.shared.map(item => <li key={`${item.roleKey}:${item.occurrence || 0}`}><bdi>{roleLabel(item.roleKey)}</bdi>: <bdi>{item.name}</bdi>
                        {item.packageCount != null && item.packageCount < preview.packageCount && <span> · {t('signingV2.compose.review.sharedInvitations', { name: item.name, count: item.packageCount, formattedCount: number(item.packageCount) })}</span>}
                    </li>)}</ul>
                    {preview.shared.every(item => item.packageCount == null || item.packageCount === preview.packageCount) && <p className="lw-signingCompose__note">{t('signingV2.compose.review.sharedInvitations', { name: sharedNames, count: preview.packageCount, formattedCount: number(preview.packageCount) })}</p>}
                </>}
                {omitted.size > 0 && <p className="lw-signingCompose__note">{t('signingV2.compose.signers.review', { names: template.roles.filter(role => omitted.has(role.key)).map(role => role.label).join(', ') })}</p>}
                <h3>{t('signingV2.compose.review.sample', { count: preview.sample.length, formattedCount: number(preview.sample.length) })}</h3>
                <ul className="lw-signingCompose__plainList">{preview.sample.map(item => <li key={item.key}>
                    {item.recipients.map((person, index) => <React.Fragment key={`${person.roleKey}:${person.occurrence || 0}`}>{index > 0 && ' · '}
                        <bdi>{roleLabel(person.roleKey)}{(template.roles.find(role => role.key === person.roleKey)?.max || 1) > 1 ? ` · ${number((person.occurrence || 0) + 1)}` : ''}</bdi>: <bdi>{person.name}</bdi> ({person.channels.map(channel => t(`signingV2.compose.channel.${channel}`)).join(', ')})
                    </React.Fragment>)}
                    {dataFields.map(field => {
                        const value = Object.hasOwn(item.data || {}, field.key) ? item.data[field.key] : field.defaultValue;
                        return value == null ? null : <div key={field.key}><bdi>{field.label || field.key}</bdi>: <bdi>{documentDataValue(field, value, { t, locale })}</bdi></div>;
                    })}
                    {!!item.exclusions?.length && <p>{t('signingV2.compose.review.excluded', { names: item.exclusions.map(document => document.name).join(', ') })}</p>}
                </li>)}</ul>
                <h3>{t('signing.upload.signingOrderLabel')}</h3>
                <p className="lw-signingCompose__note">{orderMode === 'grouped' ? t('signingV2.compose.order.grouped') : orderMode === 'sequential' ? t('signing.upload.signingOrderSequential') : t('signing.upload.signingOrderParallel')}</p>
                {orderMode === 'grouped' && <StageSummary groups={activeGroups} roles={orderedRoles} />}
                {orderMode === 'sequential' && orderedRoles.length >= 2 && <ol className="lw-signingCompose__plainList">{orderedRoles.map(role => <li key={role.key}>{role.label}</li>)}</ol>}
                <p className="lw-signingCompose__note">{t('signingV2.compose.review.otp')}</p>
                <p className="lw-signingCompose__note">{t('signingV2.compose.review.effect')}</p>
            </SimpleCard>
            <footer className="lw-signingCompose__footer is-sticky">
                <SigningBackButton onPress={() => setStep('recipients')} disabled={busy === 'create'}>{t('signingV2.compose.review.edit')}</SigningBackButton>
                <PrimaryButton onPress={create} disabled={busy === 'create'} aria-busy={busy === 'create'}>
                    {busy === 'create' ? t('signingV2.compose.review.creating') : t('signingV2.compose.review.confirm', { count: preview.packageCount, formattedCount: number(preview.packageCount) })}
                </PrimaryButton>
            </footer>
        </>}

        {step === 'done' && result && <SimpleCard className="lw-signingCompose__card">
            <div role="status">
                <h2>{t('signingV2.compose.done.heading')}</h2>
                <p>{t('signingV2.compose.done.body', { count: result.packageCount ?? preview?.packageCount ?? 0, formattedCount: number(result.packageCount ?? preview?.packageCount ?? 0) })}</p>
                {result.reused && <p>{t('signingV2.compose.done.reused')}</p>}
            </div>
            <footer className="lw-signingCompose__footer">
                <SecondaryButton onPress={restart}>{t('signingV2.compose.done.another')}</SecondaryButton>
                <PrimaryButton onPress={() => onCreated?.(result.submissionId)}>{t('signingV2.compose.done.open')}</PrimaryButton>
            </footer>
        </SimpleCard>}
    </section>;
}
