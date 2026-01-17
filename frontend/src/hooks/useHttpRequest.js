import { useCallback, useEffect, useRef, useState } from 'react';
import { usePopup } from '../providers/PopUpProvider';
import ErrorPopup from '../components/styledComponents/popups/ErrorPopup';

const useHttpRequest = (requestFunction, onSuccess, onFailure) => {
  const [isPerforming, setIsPerforming] = useState(false);
  const { openPopup, closePopup } = usePopup();
  const [result, setResult] = useState(null);

  const isPerformingRef = useRef(false);
  const requestFunctionRef = useRef(requestFunction);
  const onSuccessRef = useRef(onSuccess);
  const onFailureRef = useRef(onFailure);

  useEffect(() => {
    requestFunctionRef.current = requestFunction;
  }, [requestFunction]);

  useEffect(() => {
    onSuccessRef.current = onSuccess;
  }, [onSuccess]);

  useEffect(() => {
    onFailureRef.current = onFailure;
  }, [onFailure]);

  const defaultOnFailure = useCallback(
    (error) => {
      openPopup(<ErrorPopup closePopup={closePopup} errorText={error?.data?.message} />)
    },
    [openPopup, closePopup]
  );

  const performRequest = useCallback(async (...args) => {
    if (isPerformingRef.current) return;

    isPerformingRef.current = true;
    setIsPerforming(true);

    try {
      const data = await requestFunctionRef.current(...args);

      if (data.status !== 200 && data.status !== 201) {

        if (onFailureRef.current) onFailureRef.current(data)
        else defaultOnFailure(data);

        setResult([]);

      } else {
        setResult(data.data || []);
        onSuccessRef.current?.(data.data);
      }
    } catch (err) {

      setResult([]);

      if (onFailureRef.current) onFailureRef.current(err);
      else defaultOnFailure(err);

    } finally {
      setIsPerforming(false);
      isPerformingRef.current = false;
    }
  }, [defaultOnFailure]);

  return {
    result: result ?? [],
    isPerforming: isPerforming,
    performRequest
  };
};

export default useHttpRequest;
