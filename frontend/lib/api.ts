import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';

import {
  clearTokens,
  getAccessToken,
  getDeviceId,
  getSessionVersion,
  restoreSession,
  setAccessToken,
} from './auth';
import { API_BASE_URL } from './config';

const api = axios.create({
  baseURL: `${API_BASE_URL}/api/v1`,
  headers: { 'Content-Type': 'application/json' },
  timeout: 15_000,
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const token = getAccessToken();
  const deviceId = getDeviceId();
  const isSessionEntry = /^\/?auth\/(login|signup|token\/refresh)\/?$/.test(config.url ?? '');
  if (token && !isSessionEntry) config.headers.Authorization = `Bearer ${token}`;
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
  return '/login';
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
    // A request sent by a previous account must not refresh or clear a newer session.
    const currentToken = getAccessToken();
    if (originalRequest.headers.Authorization !== (currentToken ? `Bearer ${currentToken}` : undefined)) {
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
    const refreshVersion = getSessionVersion();
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
      if (getSessionVersion() === refreshVersion) {
        clearTokens();
        if (typeof window !== 'undefined') window.location.href = getLoginPath();
      }
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  },
);

export default api;
