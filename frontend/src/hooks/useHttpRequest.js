import { useState, useCallback } from 'react';

const useHttpRequest = (requestFunction, onSuccess, onFailure) => {
  const [result, setResult] = useState(null); // Ensure result is initially null
  const [isPerforming, setIsPerforming] = useState(false);

  const defaultOnFailure = (error) => {
    alert(`Oops! Something went wrong: ${error.message}`);
  };

  const performRequest = async (...args) => { // Accept multiple arguments
    if (isPerforming) return; // Prevent multiple concurrent requests
    setIsPerforming(true);
    try {
      const data = await requestFunction(...args); // Pass all arguments to requestFunction
      console.log('performRequest data', data);

      if (data.status !== 200) {
        defaultOnFailure(data);
        setResult([]); // If request fails, ensure result is not null but an empty array
      } else {
        setResult(data.data || []); // Ensure result is always an array or valid object
        onSuccess?.(data.data);
      }
    } catch (err) {
      console.log('performRequest err', err);
      setResult([]); // Ensure result is an empty array on error

      if (onFailure) onFailure(err);
      else defaultOnFailure(err);
    } finally {
      setIsPerforming(false);
    }
  };

  return {
    result: result ?? [], // Ensure result is never null
    isPerforming: isPerforming || result === null, // True if loading OR result is null
    performRequest
  };
};

export default useHttpRequest;
