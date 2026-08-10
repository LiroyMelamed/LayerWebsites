import { useCallback, useEffect, useRef, useState } from 'react';
import { toastFromApiError } from '../components/ui/showAppToast';

const useHttpRequest = (requestFunction, onSuccess, onFailure) => {
  const [isPerforming, setIsPerforming] = useState(false);
  const [result, setResult] = useState(null);

  const requestSeqRef = useRef(0);
  const isMountedRef = useRef(true);
  const requestFunctionRef = useRef(requestFunction);
  const onSuccessRef = useRef(onSuccess);
  const onFailureRef = useRef(onFailure);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    requestFunctionRef.current = requestFunction;
  }, [requestFunction]);

  useEffect(() => {
    onSuccessRef.current = onSuccess;
  }, [onSuccess]);

  useEffect(() => {
    onFailureRef.current = onFailure;
  }, [onFailure]);

  const defaultOnFailure = useCallback((error) => {
    toastFromApiError(error, 'שגיאה בלתי צפויה');
  }, []);

  const performRequest = useCallback(async (...args) => {
    // Latest-wins: rapid typing must not keep an older search's results.
    const seq = ++requestSeqRef.current;
    setIsPerforming(true);

    try {
      const data = await requestFunctionRef.current(...args);

      if (!isMountedRef.current || seq !== requestSeqRef.current) return;

      if (data.status !== 200 && data.status !== 201) {

        if (onFailureRef.current) onFailureRef.current(data)
        else defaultOnFailure(data);

        setResult([]);

      } else {
        setResult(data.data || []);
        onSuccessRef.current?.(data.data);
      }
    } catch (err) {

      if (!isMountedRef.current || seq !== requestSeqRef.current) return;

      setResult([]);

      if (onFailureRef.current) onFailureRef.current(err);
      else defaultOnFailure(err);

    } finally {
      if (seq === requestSeqRef.current && isMountedRef.current) {
        setIsPerforming(false);
      }
    }
  }, [defaultOnFailure]);

  return {
    result: result ?? [],
    isPerforming: isPerforming,
    performRequest
  };
};

export default useHttpRequest;
