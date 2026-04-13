import axios from 'axios';

const api = axios.create({
  baseURL: '/api/v1',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    // License-gated feature: tag the error so UI can show upgrade prompt
    if (error.response?.status === 403 && error.response?.data?.license_required) {
      error.isLicenseError = true;
      error.requiredFeature = error.response.data.feature;
    }
    return Promise.reject(error);
  }
);

export default api;