import type { User } from './types';
import { API_BASE_URL } from './config';

let accessToken: string | null = null;
let restorePromise: Promise<boolean> | null = null;
const DEVICE_ID_KEY = 'dentotime_device_id';
export const AUTH_SESSION_EVENT = 'dentotime:auth-session-changed';

export function notifyAuthSessionChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(AUTH_SESSION_EVENT));
  }
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string): void {
  accessToken = token;
  if (typeof window !== 'undefined') {
    // Remove credentials left by versions that stored JWTs in Web Storage.
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
  }
}

export function clearTokens(): void {
  accessToken = null;
  if (typeof window !== 'undefined') {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user_role');
    localStorage.removeItem('user');
    notifyAuthSessionChanged();
  }
}

export function getDeviceId(): string | null {
  if (typeof window === 'undefined') return null;
  const existing = localStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;
  const created = crypto.randomUUID();
  localStorage.setItem(DEVICE_ID_KEY, created);
  return created;
}

export async function restoreSession(forceRefresh = false): Promise<boolean> {
  if (accessToken && !forceRefresh) return true;
  if (restorePromise) return restorePromise;

  restorePromise = fetch(`${API_BASE_URL}/api/v1/auth/token/refresh/`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  })
    .then(async (response) => {
      if (!response.ok) {
        accessToken = null;
        return false;
      }
      const payload = (await response.json()) as { access?: string };
      if (!payload.access) return false;
      setAccessToken(payload.access);
      return true;
    })
    .catch(() => {
      accessToken = null;
      return false;
    })
    .finally(() => {
      restorePromise = null;
    });

  return restorePromise;
}

export async function getCurrentUser(): Promise<User> {
  const { default: api } = await import('./api');
  const response = await api.get<User>('/users/me/');
  return response.data;
}

export function isDoctor(user: User): boolean {
  return user.role === 'DOCTOR';
}
