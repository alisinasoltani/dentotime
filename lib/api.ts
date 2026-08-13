import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';

import {
  clearTokens,
  getAccessToken,
  getDeviceId,
  restoreSession,
  setAccessToken,
} from './auth';
import { API_BASE_URL } from './config';

const api = axios.create({
  baseURL: `${API_BASE_URL}/api/v1`,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30_000,
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const token = getAccessToken();
  const deviceId = getDeviceId();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  else delete config.headers.Authorization;
  if (deviceId) config.headers['X-Device-ID'] = deviceId;
  return config;
});

type RetryableConfig = InternalAxiosRequestConfig & { _retry?: boolean };
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}> = [];

function processQueue(error: unknown, token: string | null): void {
  for (const pending of failedQueue) {
    if (error) pending.reject(error);
    else if (token) pending.resolve(token);
  }
  failedQueue = [];
}

function getLoginPath(): string {
  if (typeof window === 'undefined') return '/login';
  return window.location.pathname.startsWith('/admin') ? '/admin/login' : '/login';
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as RetryableConfig | undefined;
    if (!originalRequest) return Promise.reject(error);
    const isAuthEndpoint = ['/auth/login', '/auth/token/refresh', '/auth/signup'].some(
      (path) => originalRequest.url?.includes(path),
    );

    if (error.response?.status !== 401 || originalRequest._retry || isAuthEndpoint) {
      return Promise.reject(error);
    }
    originalRequest._retry = true;

    if (isRefreshing) {
      return new Promise<string>((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      }).then((token) => {
        originalRequest.headers.Authorization = `Bearer ${token}`;
        return api(originalRequest);
      });
    }

    isRefreshing = true;
    try {
      const restored = await restoreSession(true);
      const token = getAccessToken();
      if (!restored || !token) throw error;
      setAccessToken(token);
      processQueue(null, token);
      originalRequest.headers.Authorization = `Bearer ${token}`;
      return api(originalRequest);
    } catch (refreshError) {
      processQueue(refreshError, null);
      clearTokens();
      if (typeof window !== 'undefined') window.location.href = getLoginPath();
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  },
);

export default api;
