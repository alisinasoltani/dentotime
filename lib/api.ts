// =============================================================================
// lib/api.ts
// Axios instance + interceptors
// =============================================================================

import axios, {
  type AxiosError,
  type InternalAxiosRequestConfig,
} from 'axios';
import {
  getAccessToken,
  getRefreshToken,
  setTokens,
  clearTokens,
} from './auth';
import { API_BASE_URL } from './config';

const api = axios.create({
  baseURL: `${API_BASE_URL}/api/v1`,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 0, 
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  
  // لیست مسیرهایی که نباید توکن بفرستیم (مسیرهای عمومی و لاگین)
  const publicUrls = ['/auth/login/', '/auth/signup/', '/auth/request-otp/', '/auth/verify-otp/', '/auth/reset-password/'];
  const isPublicUrl = publicUrls.some(url => config.url?.includes(url));

  // اگر توکن داشتیم و مسیر عمومی نبود، توکن را در هدر بفرست
  if (token && token !== "null" && token !== "undefined" && !isPublicUrl) {
    config.headers.Authorization = `Bearer ${token}`;
  } else {
    // در غیر اینصورت، هدر Authorization را کاملا حذف کن
    delete config.headers.Authorization;
  }
  
  return config;
});

type RetryableConfig = InternalAxiosRequestConfig & { _retry?: boolean };

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}> = [];

function processQueue(error: unknown, token: string | null): void {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else if (token) {
      resolve(token);
    }
  });
  failedQueue = [];
}

function getLoginPath(): string {
  if (typeof window === 'undefined') return '/login';
  return window.location.pathname.startsWith('/admin') ? '/admin/login' : '/login';
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as RetryableConfig;
    
    // بررسی اینکه آیا مسیر درخواست، مربوط به لاگین یا رفرش توکن است یا خیر
    const isAuthEndpoint = originalRequest.url?.includes('/auth/login') || 
                           originalRequest.url?.includes('/auth/token/refresh') ||
                           originalRequest.url?.includes('/auth/signup');

    // اگر خطا 401 است و اولین تلاش است و مربوط به صفحه لاگین/رفرش نیست
    if (error.response?.status === 401 && !originalRequest._retry && !isAuthEndpoint) {
      originalRequest._retry = true;
      
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return api(originalRequest);
        }).catch((err) => Promise.reject(err));
      }

      isRefreshing = true;
      const refreshToken = getRefreshToken();
      
      if (!refreshToken) {
        isRefreshing = false;
        clearTokens();
        if (typeof window !== 'undefined') {
          window.location.href = getLoginPath();
        }
        return Promise.reject(error);
      }

      try {
        const res = await api.post('/auth/token/refresh/', {
          refresh: refreshToken,
        });
        
        const newAccessToken = res.data.access;
        const newRefreshToken = res.data.refresh;
        
        setTokens(newAccessToken, newRefreshToken);
        api.defaults.headers.common.Authorization = `Bearer ${newAccessToken}`;
        
        processQueue(null, newAccessToken);
        
        return api(originalRequest);
      } catch (err) {
        processQueue(err, null);
        clearTokens();
        
        if (typeof window !== 'undefined') {
          window.location.href = getLoginPath();
        }
        return Promise.reject(err);
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(error);
  }
);

export default api;