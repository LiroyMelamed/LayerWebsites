import { useState } from 'react';

const useHttpRequest = (requestFunction, onSuccess, onFailure) => {
  const [result, setResult] = useState(null);
  const [isPerforming, setIsPerforming] = useState(true);

  const defaultOnFailure = (error) => {
    alert(`Oops! Something went wrong: ${error.message}`);
  };

  const performRequest = async () => {
    setIsPerforming(true);
    try {
      const data = await requestFunction();
      setResult(data);
      if (onSuccess) onSuccess(data);
    } catch (err) {
      if (onFailure) onFailure(err);
      else defaultOnFailure(err);
    } finally {
      setIsPerforming(false);
    }
  };

  return { result, isPerforming, performRequest };
};

export default useHttpRequest;
