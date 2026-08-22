import type { User } from './types';
import { API_BASE_URL } from './config';

let accessToken: string | null = null;
let restorePromise: Promise<boolean> | null = null;
const DEVICE_ID_KEY = 'dentotime_device_id';
const SESSION_MARKER_KEY = 'dentotime_has_session';
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
    localStorage.setItem(SESSION_MARKER_KEY, '1');
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
    localStorage.removeItem(SESSION_MARKER_KEY);
    notifyAuthSessionChanged();
  }
}

function createDeviceId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();

  // randomUUID is restricted to secure contexts (HTTPS/localhost), while
  // getRandomValues is still available on an HTTP deployment addressed by IP.
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`;
}

export function getDeviceId(): string | null {
  if (typeof window === 'undefined') return null;
  const existing = localStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;
  const created = createDeviceId();
  localStorage.setItem(DEVICE_ID_KEY, created);
  return created;
}

export async function restoreSession(forceRefresh = false): Promise<boolean> {
  if (accessToken && !forceRefresh) return true;
  if (
    !forceRefresh &&
    typeof window !== 'undefined' &&
    localStorage.getItem(SESSION_MARKER_KEY) !== '1'
  ) {
    return false;
  }
  if (restorePromise) return restorePromise;

  restorePromise = fetch(`${API_BASE_URL}/api/v1/auth/token/refresh/`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  })
    .then(async (response) => {
      if (!response.ok) {
        accessToken = null;
        if (
          typeof window !== 'undefined' &&
          (response.status === 401 || response.status === 403)
        ) {
          localStorage.removeItem(SESSION_MARKER_KEY);
        }
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
