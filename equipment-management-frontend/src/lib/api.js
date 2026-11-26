import axios from 'axios';

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000/api', timeout: 15000 });
api.interceptors.request.use(config => {
  const token = localStorage.getItem('equiply_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
api.interceptors.response.use(r => r, error => {
  if (error.response?.status === 401) {
    localStorage.removeItem('equiply_token');
    localStorage.removeItem('equiply_user');
    if (!window.location.pathname.includes('/login')) window.location.href = '/login';
  }
  return Promise.reject(error);
});
export const unwrap = data => data?.data ?? data?.items ?? data?.results ?? data;
export const listOf = data => { const x = unwrap(data); return Array.isArray(x) ? x : (x?.rows || x?.items || []); };
export const apiError = e => e?.response?.data?.message || e?.response?.data?.error || e.message || 'Something went wrong';
export default api;
