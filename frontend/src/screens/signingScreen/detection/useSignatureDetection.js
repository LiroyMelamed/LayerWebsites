import { useCallback, useEffect, useRef, useState } from 'react';
import { signerFingerprint, validDetectedSpot } from './detectionReview';

export default function useSignatureDetection({ file, signers, fileKey, onFileKey, uploadFile, detectSpots }) {
    const [review, setReview] = useState(null);
    const [detecting, setDetecting] = useState(false);
    const [error, setError] = useState(false);
    const generation = useRef(0);
    const busy = useRef(false);
    const fingerprint = signerFingerprint(signers);
    const context = useRef({ file, fingerprint });
    context.current = { file, fingerprint };

    useEffect(() => {
        generation.current += 1;
        busy.current = false;
        setDetecting(false);
        setReview(null);
        setError(false);
        return () => { generation.current += 1; };
    }, [file, fingerprint]);

    const detect = useCallback(async () => {
        if (!file || busy.current) return;
        const request = ++generation.current;
        const isCurrent = () => request === generation.current
            && file === context.current.file && fingerprint === context.current.fingerprint;
        busy.current = true;
        setDetecting(true);
        setError(false);
        setReview(null);
        try {
            let key = fileKey;
            if (!key) {
                const uploaded = await uploadFile(file);
                key = uploaded?.key ?? uploaded?.data?.key;
                if (!isCurrent()) return;
                if (!key) throw new Error('Missing uploaded file key');
                onFileKey(key);
            }
            const payload = signers.map(s => ({ userId: Number(s.UserId ?? s.userId), name: s.Name ?? s.name }));
            const response = await detectSpots(key, payload.length ? payload : null);
            if (!isCurrent()) return;
            const result = response?.data ?? response ?? {};
            const spots = result.spots || [];
            if (!Array.isArray(spots) || spots.length > 200 || spots.some(spot => !validDetectedSpot(spot))) {
                throw new Error('Invalid or oversized signature detection result');
            }
            setReview({ ...result, id: request, spots });
        } catch {
            if (isCurrent()) setError(true);
        } finally {
            if (isCurrent()) {
                busy.current = false;
                setDetecting(false);
            }
        }
    }, [file, fileKey, fingerprint, signers, uploadFile, detectSpots, onFileKey]);

    return { review, detecting, error, detect, dismiss: () => setReview(null) };
}
