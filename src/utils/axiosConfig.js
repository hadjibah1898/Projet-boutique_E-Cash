/**
 * @file axiosConfig.js
 * @description Configuration des intercepteurs Axios (token, erreurs).
 */

import api from '../services/api';

let requestCount = 0;

const setupAxiosInterceptors = (setIsApiLoading) => {
  // Intercepteur de requête connecté à ton instance personnalisée
  api.interceptors.request.use(
    (config) => {
      requestCount++;
      setIsApiLoading(true);
      return config;
    },
    (error) => Promise.reject(error)
  );

  // Intercepteur de réponse connecté à ton instance personnalisée
  api.interceptors.response.use(
    (response) => {
      requestCount--;
      if (requestCount === 0) setIsApiLoading(false);
      return response;
    },
    (error) => {
      requestCount--;
      if (requestCount === 0) setIsApiLoading(false);
      return Promise.reject(error);
    }
  );
};

export default setupAxiosInterceptors;