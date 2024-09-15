import { useState, useCallback } from 'react';

const useHttpRequest = (requestFunction, onSuccess, onFailure) => {
  const [result, setResult] = useState([]);
  const [isPerforming, setIsPerforming] = useState(false);

  const defaultOnFailure = (error) => {
    alert(`Oops! Something went wrong: ${error.message}`);
  };

  const performRequest = async (params) => {
    if (isPerforming) return; // Prevent multiple concurrent requests
    setIsPerforming(true);
    try {
      const data = await requestFunction(params);
      setResult(data);
      if (onSuccess) onSuccess(data);
    } catch (err) {
      if (onFailure) onFailure(err);
      else defaultOnFailure(err);
    } finally {
      setIsPerforming(false);
    }
  }

  return { result, isPerforming, performRequest };
};

export default useHttpRequest;
