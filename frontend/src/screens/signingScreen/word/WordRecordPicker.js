import React, { useEffect, useRef, useState } from 'react';
import SearchInput from '../../../components/specializedComponents/containers/SearchInput';
import StatusNotice from '../../../components/ui/StatusNotice';
import signingTemplatesApi from '../../../api/signingTemplatesApi';
import packagesApi from '../../../api/signingPackagesApi';
import useSigningLocale from '../templates/useSigningLocale';

// Selection stores an opaque record ID; the UI only displays human-readable
// names/contact details. The preview service is the sole profile-data reader.
export default function WordRecordPicker({ kind = 'person', label, value, onChange, disabled }) {
    const { t, direction } = useSigningLocale();
    const text = key => t(`signingWord.${key}`);
    const [query, setQuery] = useState(value?.label || '');
    const [results, setResults] = useState([]);
    const [busy, setBusy] = useState(false);
    const [failed, setFailed] = useState(false);
    const timer = useRef(null);
    const generation = useRef(0);
    const echo = useRef(null);
    const expectedValue = useRef(null);
    const latest = useRef({ value, onChange, disabled });
    latest.current = { value, onChange, disabled };
    useEffect(() => {
        const expected = expectedValue.current;
        if (expected && expected.id === (value?.id ?? null) && expected.label === (value?.label || '')) { expectedValue.current = null; return; }
        generation.current += 1; clearTimeout(timer.current); setResults([]); setBusy(false); setFailed(false);
        setQuery(value?.label || '');
    }, [value?.id, value?.label]);
    useEffect(() => () => { generation.current += 1; clearTimeout(timer.current); }, []);

    const search = next => {
        if (latest.current.disabled) return;
        setQuery(next);
        // SearchInput invokes onSearch once after committing a result.
        if (echo.current === next) { echo.current = null; return; }
        echo.current = null;
        clearTimeout(timer.current); const current = ++generation.current;
        setResults([]); setFailed(false); setBusy(false);
        if (next !== latest.current.value?.label) { expectedValue.current = { id: null, label: '' }; latest.current.onChange(null); }
        timer.current = setTimeout(async () => {
            setBusy(true);
            try {
                const response = kind === 'case' ? await packagesApi.cases(next.trim()) : kind === 'client'
                    ? await signingTemplatesApi.contacts(next.trim(), 'client') : await signingTemplatesApi.contacts(next.trim());
                if (current !== generation.current) return;
                const records = (kind === 'case' ? response?.cases : response?.contacts) || [];
                setResults(kind === 'client' ? records.filter(item => item.role === 'Client') : records);
            } catch { if (current === generation.current) setFailed(true); }
            finally { if (current === generation.current) setBusy(false); }
        }, 180);
    };
    const display = item => kind === 'case' ? [item.name, item.company].filter(Boolean).join(' · ')
        : [item.name, text(item.role === 'Client' ? 'contactClient' : ['Admin', 'Lawyer'].includes(item.role) ? 'contactManager' : 'contactStaff'), item.email || item.phone].filter(Boolean).join(' · ');
    const manual = () => {
        if (latest.current.disabled) return;
        generation.current += 1; clearTimeout(timer.current); echo.current = null;
        setQuery(''); setResults([]); setBusy(false); setFailed(false); expectedValue.current = { id: null, label: '' }; latest.current.onChange(null);
    };
    return <div className="lw-word__recordPicker">
        <SearchInput title={label} aria-label={label} dir={direction} containerDir={direction} value={query} disabled={disabled}
            maxLength={100} timeToWaitInMilli={0} acceptExternalValueWhileFocused onSearch={search} isPerforming={busy} queryResult={results}
            getButtonTextFunction={display} getSelectValueFunction={item => item.name}
            buttonPressFunction={(name, item) => {
                if (latest.current.disabled) return;
                const id = Number(kind === 'case' ? item.id : item.userId);
                if (!Number.isSafeInteger(id) || id < 1) return;
                generation.current += 1; clearTimeout(timer.current); echo.current = name;
                setQuery(name); setResults([]); setBusy(false); setFailed(false);
                expectedValue.current = { id, label: name }; latest.current.onChange({ id, label: name });
            }} />
        <p className="lw-word__pickerHelp">{text(kind === 'case' ? 'caseSearchHelp' : kind === 'client' ? 'clientSearchHelp' : 'personSearchHelp')}</p>
        {value && <p className="lw-word__pickerSelection" role="status">{text('selectedRecord')} <bdi>{value.label}</bdi></p>}
        <button type="button" disabled={disabled} onClick={manual}>{text(kind === 'case' ? 'withoutCase' : 'manualPerson')}</button>
        {failed && <StatusNotice embedded><p>{text('searchFailed')}</p></StatusNotice>}
    </div>;
}
