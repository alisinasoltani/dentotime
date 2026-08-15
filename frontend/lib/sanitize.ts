// =============================================================================
// lib/sanitize.ts
// Input sanitization helpers — defense-in-depth layer (Section 5.5, 9.4).
// Server-side validation is still the source of truth; this strips
// HTML/script content before the value ever reaches the network.
// =============================================================================

import DOMPurify from 'dompurify';

/**
 * Strip all HTML tags from a string value.
 * Uses DOMPurify with ALLOWED_TAGS: [] (no tags survive) on the client.
 * Falls back to a regex-based strip on the server (SSR), where DOMPurify
 * has no DOM to work against.
 *
 * Call this on every free-text field value before sending it to the API
 * (names, clinic names, rejection notes, chat messages, etc.).
 */
export function sanitizeText(value: string): string {
  if (typeof window === 'undefined') {
    // SSR fallback — basic tag stripping. Real sanitization happens client-side
    // at form-submit time, which is always a client context.
    return value.replace(/<[^>]*>/g, '').trim();
  }

  return DOMPurify.sanitize(value, { ALLOWED_TAGS: [] }) as string;
}

/**
 * Sanitize an arbitrary value that may be string | null | undefined.
 * Returns null for null-ish input; otherwise the sanitized string.
 */
export function sanitizeOptionalText(value: string | null | undefined): string | null {
  if (value == null) return null;
  return sanitizeText(value);
}