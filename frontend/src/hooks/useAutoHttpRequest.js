import { useEffect } from 'react';
import useHttpRequest from './useHttpRequest';

const useAutoHttpRequest = (requestFunction, { body = [], onSuccess = null, onFailure = null } = {}) => {
  const { result, isPerforming, error, performRequest } = useHttpRequest(requestFunction, onSuccess, onFailure);

  useEffect(() => {
    performRequest(body);
  }, []);

  return { result, isPerforming, error, performRequest };
};

export default useAutoHttpRequest;
