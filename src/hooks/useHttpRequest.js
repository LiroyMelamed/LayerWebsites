import { useState, useEffect } from 'react';

const useHttpRequest = (requestFunction, onSuccess, onFailure) => {
  const [result, setResult] = useState(null);
  const [isPerforming, setIsPerforming] = useState(false);

  // Default onFailure function
  const defaultOnFailure = (error) => {
    alert(`Oops! Something went wrong: ${error.message}`);
  };

  useEffect(() => {
    const fetchData = async () => {
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

    fetchData();
  }, [requestFunction]);

  return { result, isPerforming };
};

export default useHttpRequest;
