import { useState, useCallback } from 'react';
import { usePopup } from '../providers/PopUpProvider';
import ErrorPopup from '../components/styledComponents/popups/ErrorPopup';

const useHttpRequest = (requestFunction, onSuccess, onFailure) => {
  const [isPerforming, setIsPerforming] = useState(false);
  const { openPopup, closePopup } = usePopup();
  const [result, setResult] = useState(null);

  const defaultOnFailure = (error) => {
    openPopup(<ErrorPopup closePopup={closePopup} errorText={error?.data?.message} />)
  };

  const performRequest = async (...args) => {
    if (isPerforming) return;
    setIsPerforming(true);

    try {
      const data = await requestFunction(...args);

      if (data.status !== 200 && data.status !== 201) {

        if (onFailure) onFailure(data)
        else defaultOnFailure(data);

        setResult([]);

      } else {
        setResult(data.data || []);
        onSuccess?.(data.data);
      }
    } catch (err) {

      setResult([]);

      if (onFailure) onFailure(err);
      else defaultOnFailure(err);

    } finally {
      setIsPerforming(false);
    }
  };

  return {
    result: result ?? [],
    isPerforming: isPerforming,
    performRequest
  };
};

export default useHttpRequest;
