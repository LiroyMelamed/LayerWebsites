import { useEffect } from 'react';
import useHttpRequest from './useHttpRequest';

const useAutoHttpRequest = (requestFunction, { body = [], onSuccess = null, onFailure = null } = {}) => {
  const { result, isPerforming, error, performRequest } = useHttpRequest(requestFunction, onSuccess, onFailure);

  useEffect(() => {
    performRequest(body); // Execute the request on component mount
  }, []); // Empty dependency array to ensure it only runs once

  return { result, isPerforming, error, performRequest };
};

export default useAutoHttpRequest;
