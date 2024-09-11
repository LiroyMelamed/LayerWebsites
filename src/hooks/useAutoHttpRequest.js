import { useEffect } from 'react';
import useHttpRequest from './useHttpRequest';

const useAutoHttpRequest = (requestFunction, dependencies = []) => {
  const { result, isPerforming, error, performRequest } = useHttpRequest(requestFunction);

  useEffect(() => {
    performRequest();
  }, dependencies);

  return { result, isPerforming, error };
};

export default useAutoHttpRequest;
