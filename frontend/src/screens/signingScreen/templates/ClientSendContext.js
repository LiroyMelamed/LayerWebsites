import React, { useEffect, useRef, useState } from 'react';
import TertiaryButton from '../../../components/styledComponents/buttons/TertiaryButton';
import StatusNotice from '../../../components/ui/StatusNotice';
import useSigningLocale from './useSigningLocale';

export default function ClientSendContext({ api, initialClientId, value, onChange, onPending }) {
    const { t, errorMessage } = useSigningLocale();
    const [busy, setBusy] = useState(!!initialClientId);
    const [error, setError] = useState(null);
    const generation = useRef(0);
    const callbacks = useRef({ onChange, onPending });
    callbacks.current = { onChange, onPending };
    const load = async () => {
        const current = ++generation.current;
        setBusy(true); setError(null); callbacks.current.onPending(true);
        try {
            const record = await api.clientContext(initialClientId);
            if (current !== generation.current) return;
            callbacks.current.onChange(record); callbacks.current.onPending(false);
        } catch (failure) { if (current === generation.current) setError(failure); }
        finally { if (current === generation.current) setBusy(false); }
    };
    useEffect(() => {
        if (initialClientId) load();
        return () => { generation.current += 1; };
        // The entry ID belongs to this composer; recovering a draft supplies an
        // already reauthorized value instead of reloading the original entry.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const clear = () => {
        generation.current += 1; setError(null); setBusy(false);
        callbacks.current.onChange(null); callbacks.current.onPending(false);
    };
    if (!value && !busy && !error) return null;
    return <div className="lw-signingCompose__case">
        {busy && <p role="status">{t('signingV2.compose.clientContext.loading')}</p>}
        {value && <><p><strong>{t('signingV2.compose.clientContext.selected')}</strong> <bdi>{value.name}</bdi></p>
            <p className="lw-signingCompose__hintLine">{t('signingV2.compose.clientContext.help')}</p>
            <TertiaryButton onPress={clear}>{t('signingV2.compose.clientContext.remove')}</TertiaryButton></>}
        {error && <StatusNotice embedded><p>{errorMessage(error)}</p>
            <TertiaryButton onPress={load}>{t('common.retry')}</TertiaryButton>
            <TertiaryButton onPress={clear}>{t('signingV2.compose.clientContext.without')}</TertiaryButton></StatusNotice>}
    </div>;
}
