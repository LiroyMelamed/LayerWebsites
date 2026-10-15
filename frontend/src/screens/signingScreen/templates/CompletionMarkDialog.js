import React, { useEffect, useRef, useState } from 'react';
import SimplePopUp from '../../../components/simpleComponents/SimplePopUp';
import PrimaryButton from '../../../components/styledComponents/buttons/PrimaryButton';
import FileUploadBox from '../../../components/styledComponents/fileUpload/FileUploadBox';
import LawyerStampPopup from '../../../components/specializedComponents/signFiles/LawyerStampPopup';
import StatusNotice from '../../../components/ui/StatusNotice';
import SigningSelect from './SigningSelect';
import useSigningLocale from './useSigningLocale';

export default function CompletionMarkDialog({ onClose, onConfirm }) {
    const { t, direction } = useSigningLocale();
    const tr = key => t(`signingV2.completionMark.${key}`);
    const [kind, setKind] = useState('office_stamp');
    const [image, setImage] = useState(null), [authorized, setAuthorized] = useState(false);
    const [busy, setBusy] = useState(false), [error, setError] = useState('');
    const locked = useRef(false), generation = useRef(0);
    useEffect(() => () => { generation.current += 1; }, []);
    const selectImage = file => {
        if (locked.current) return;
        const current = ++generation.current;
        setImage(null); setAuthorized(false); setError('');
        if (!file || !['image/png', 'image/jpeg'].includes(file.type) || file.size > 5 * 1024 * 1024) { setError(tr('imageOnly')); return; }
        const reader = new FileReader();
        reader.onerror = () => { if (current === generation.current) setError(tr('imageOnly')); };
        reader.onload = () => {
            const img = new Image();
            img.onerror = () => { if (current === generation.current) setError(tr('imageOnly')); };
            img.onload = () => {
                if (current !== generation.current) return;
                const scale = Math.min(1, 1200 / Math.max(img.naturalWidth, img.naturalHeight));
                const canvas = window.document.createElement('canvas');
                canvas.width = Math.round(img.naturalWidth * scale); canvas.height = Math.round(img.naturalHeight * scale);
                canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
                const result = canvas.toDataURL('image/png');
                if (result.length > 410000) { setError(tr('imageOnly')); return; }
                setImage(result);
            };
            img.src = reader.result;
        };
        reader.readAsDataURL(file);
    };
    const submit = async () => {
        if (!image || !authorized || locked.current) return;
        locked.current = true; setBusy(true); setError('');
        try { await onConfirm({ kind, image, authorized: true }); }
        catch (failure) { setError(failure.message || tr('failed')); }
        finally { locked.current = false; setBusy(false); }
    };
    return <SimplePopUp isOpen onClose={() => { if (!busy) onClose(); }} role="dialog" aria-modal="true" aria-label={tr('title')} dir={direction}>
        <div className="lw-templates lw-templates__fieldDialog" dir={direction}>
            <h2>{tr('title')}</h2><p>{tr('help')}</p><p>{tr('manualSigner')}</p>
            <fieldset disabled={busy}>
                <label>{tr('kind')}<SigningSelect value={kind} onChange={event => { generation.current += 1; setKind(event.target.value); setImage(null); setAuthorized(false); }}>
                    {['office_stamp', 'lawyer_signature', 'combined'].map(value => <option key={value} value={value}>{tr(value)}</option>)}
                </SigningSelect></label>
                {kind === 'combined' ? <LawyerStampPopup onConfirm={next => { setImage(next); setAuthorized(false); }} onCancel={onClose} /> :
                    <FileUploadBox disabled={busy} accept="image/png,image/jpeg" label={tr('upload')} onFileSelected={selectImage} />}
                {image && <img src={image} alt={tr('preview')} style={{ maxWidth: '100%', maxHeight: 160, objectFit: 'contain' }} />}
                <label className="lw-templates__check"><input type="checkbox" checked={authorized} onChange={event => setAuthorized(event.target.checked)} />{tr('authorize')}</label>
            </fieldset>
            {error && <StatusNotice>{error}</StatusNotice>}
            <PrimaryButton onPress={submit} disabled={busy || !image || !authorized}>{t(busy ? 'common.loading' : 'signingV2.completionMark.add')}</PrimaryButton>
        </div>
    </SimplePopUp>;
}
