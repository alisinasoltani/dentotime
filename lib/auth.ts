// lib/auth.ts
import type { User } from './types';

const ACCESS_TOKEN_KEY = 'access_token';
const REFRESH_TOKEN_KEY = 'refresh_token';

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setTokens(accessToken: string, refreshToken: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

export function clearTokens(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  // پاک کردن نقش کاربر هم در اینجا اضافه شد
  localStorage.removeItem('user_role');
}

export async function getCurrentUser(): Promise<User> {
  const { default: api } = await import('./api');
  try {
    const response = await api.get<User>('/users/me/');
    return response.data;
  } catch (error) {
    // ارور اینجا پرتاب می‌شود تا توسط useAuth یا DoctorProvider مدیریت شود
    throw error;
  }
}

export function isDoctor(user: User): boolean {
  return user.role === 'DOCTOR';
}