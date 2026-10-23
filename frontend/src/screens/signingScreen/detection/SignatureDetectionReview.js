import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import PrimaryButton from '../../../components/styledComponents/buttons/PrimaryButton';
import SecondaryButton from '../../../components/styledComponents/buttons/SecondaryButton';
import SigningSelect from '../templates/SigningSelect';
import { resolveSpotSignerIndex } from './detectionReview';
import './signatureDetectionReview.scss';

export default function SignatureDetectionReview({ review, signers, onApply, onDismiss }) {
    const { t } = useTranslation();
    const [choices, setChoices] = useState(() => review.spots.map(spot => ({
        included: true, signerId: signers[resolveSpotSignerIndex(signers, spot)]?.UserId ?? '',
    })));
    const selected = choices.filter(choice => choice.included);
    const cramped = Number(review.crampedSignatureCount) > 0;
    const ready = selected.length > 0 && selected.every(choice => signers.some(s => String(s.UserId) === String(choice.signerId)));
    const update = (index, patch) => setChoices(prev => prev.map((choice, i) => i === index ? { ...choice, ...patch } : choice));
    const apply = () => {
        if (!ready) return;
        onApply(review.spots.flatMap((spot, index) => {
            if (!choices[index].included) return [];
            const signerIndex = signers.findIndex(s => String(s.UserId) === String(choices[index].signerId));
            const signer = signers[signerIndex];
            if (!signer) return [];
            return [{ ...spot, signerIndex, signerUserId: signer.UserId, signerName: signer.Name, assignmentStatus: 'reviewed' }];
        }));
    };

    return <section className="lw-detectionReview" aria-label={t('signing.upload.detect.reviewTitle')}>
        <h4>{t('signing.upload.detect.reviewTitle')}</h4>
        <p role="status">{t(review.spots.length ? 'signing.upload.detect.reviewHelp' : cramped ? 'signing.upload.detect.crampedLocations' : 'signing.upload.detect.noneFound')}</p>
        {review.noTextPages?.length > 0 && <p className="lw-detectionReview__warning">{t('signing.upload.detect.scannedPages')}</p>}
        {cramped && review.spots.length > 0 && <p className="lw-detectionReview__warning">{t('signing.upload.detect.crampedLocations')}</p>}
        {review.spots.length > 0 && <ol className="lw-detectionReview__list">
            {review.spots.map((spot, index) => <li key={index}>
                <label className="lw-detectionReview__include">
                    <input type="checkbox" checked={choices[index].included} onChange={event => update(index, { included: event.target.checked })} />
                    <span>{t('signing.upload.detect.candidate', { index: index + 1, page: spot.pageNum })}</span>
                </label>
                <label className="lw-detectionReview__signer">
                    <span>{t('signing.fieldSettings.signerLabel')}</span>
                    <SigningSelect aria-label={t('signing.upload.detect.assignCandidate', { index: index + 1 })}
                        value={choices[index].signerId} disabled={!choices[index].included}
                        onChange={event => update(index, { signerId: event.target.value })}>
                        <option value="">{t('signing.upload.detect.chooseSigner')}</option>
                        {signers.map(signer => <option key={signer.UserId} value={signer.UserId}>{signer.Name}</option>)}
                    </SigningSelect>
                </label>
            </li>)}
        </ol>}
        {selected.length > 0 && !ready && <p>{t('signing.upload.detect.assignmentRequired')}</p>}
        <div className="lw-detectionReview__actions">
            {review.spots.length > 0 && <PrimaryButton onPress={apply} disabled={!ready}>{t('signing.upload.detect.apply')}</PrimaryButton>}
            <SecondaryButton onPress={onDismiss}>{t('signing.upload.detect.dismiss')}</SecondaryButton>
        </div>
    </section>;
}
