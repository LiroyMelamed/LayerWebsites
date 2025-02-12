import { useState, useCallback } from 'react';

const useHttpRequest = (requestFunction, onSuccess, onFailure) => {
  const [result, setResult] = useState(null);
  const [isPerforming, setIsPerforming] = useState(false);

  const defaultOnFailure = (error) => {
    alert(`Oops! Something went wrong: ${error?.data?.message}`);
  };

  const performRequest = async (...args) => {
    if (isPerforming) return;
    setIsPerforming(true);
    try {
      const data = await requestFunction(...args);

      if (data.status !== 200 && data.status !== 201) {
        defaultOnFailure(data);
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
