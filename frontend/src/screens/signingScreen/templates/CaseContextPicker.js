import React, { useEffect, useRef, useState } from 'react';
import SearchInput from '../../../components/specializedComponents/containers/SearchInput';
import StatusNotice from '../../../components/ui/StatusNotice';
import TertiaryButton from '../../../components/styledComponents/buttons/TertiaryButton';
import useSigningLocale from './useSigningLocale';

export default function CaseContextPicker({ api, initialCaseId, value, onChange, onPending }) {
    const { t, direction, errorMessage } = useSigningLocale();
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const generation = useRef(0);
    const timer = useRef(null);
    const selectionEcho = useRef(null);
    const callbacks = useRef({ onChange, onPending });
    callbacks.current = { onChange, onPending };
    const load = async id => {
        const current = ++generation.current;
        clearTimeout(timer.current); setResults([]); setBusy(true); setError(null);
        callbacks.current.onPending(true);
        try {
            const record = await api.caseContext(id);
            if (current !== generation.current) return;
            callbacks.current.onChange(record); callbacks.current.onPending(false);
        } catch (failure) { if (current === generation.current) setError(failure); }
        finally { if (current === generation.current) setBusy(false); }
    };
    useEffect(() => {
        if (initialCaseId) load(initialCaseId);
        return () => { generation.current += 1; clearTimeout(timer.current); };
        // initialCaseId identifies this composer; callers key a new composer when it changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const clear = () => {
        generation.current += 1; clearTimeout(timer.current); setResults([]); setQuery(''); setError(null); setBusy(false);
        callbacks.current.onChange(null); callbacks.current.onPending(false);
    };
    const search = text => {
        // SearchInput commits a selected result through onSearch after onPick.
        // That echo must not cancel the detail request we just started.
        if (selectionEcho.current === text) { selectionEcho.current = null; setQuery(text); return; }
        selectionEcho.current = null;
        callbacks.current.onPending(false);
        setQuery(text); setResults([]); setError(null); clearTimeout(timer.current);
        const current = ++generation.current;
        timer.current = setTimeout(async () => {
            setBusy(true);
            try { const data = await api.cases(text); if (current === generation.current) setResults(data.cases || []); }
            catch (failure) { if (current === generation.current) setError(failure); }
            finally { if (current === generation.current) setBusy(false); }
        }, 200);
    };
    return <div className="lw-signingCompose__case">
        {value ? <><p><strong>{t('signingV2.compose.context.selected')}</strong> <bdi>{value.name}</bdi></p>
            <TertiaryButton onPress={clear}>{t('signingV2.compose.context.remove')}</TertiaryButton></> : <SearchInput
            title={t('signingV2.compose.context.label')} aria-label={t('signingV2.compose.context.label')}
            value={query} onSearch={search} timeToWaitInMilli={0} maxLength={160} dir={direction} containerDir={direction}
            isPerforming={busy} queryResult={results} acceptExternalValueWhileFocused
            getButtonTextFunction={item => `${item.name} · ${item.id}`}
            getSelectValueFunction={item => item.name} buttonPressFunction={(text, item) => { selectionEcho.current = text; load(item.id); }} />}
        <p className="lw-signingCompose__hintLine">{t('signingV2.compose.context.help')}</p>
        {error && <StatusNotice embedded><p>{errorMessage(error)}</p>
            <TertiaryButton onPress={clear}>{t('signingV2.compose.context.without')}</TertiaryButton></StatusNotice>}
    </div>;
}
