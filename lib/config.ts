// =============================================================================
// lib/config.ts
// App-wide constants. Isolated here so one-line swaps don't require
// component edits (Section 0 item 5, Section 5.7).
// =============================================================================

/**
 * Placeholder support phone number.
 * Product owner will replace with the real number later — this is the
 * ONLY place that needs to change (Section 5.7).
 */
export const SUPPORT_PHONE_NUMBER = '021-2061454';

/** Backend base URL (without /api/v1 suffix — that's appended in lib/api.ts). */
export const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL ?? '').replace(/\/$/, '');

/** Chat message polling interval — 3 seconds (Section 6.3). */
export const CHAT_MESSAGE_POLLING_INTERVAL = 3_000;

/** Chat thread-list polling interval — 5 seconds (Section 6.2). */
export const CHAT_THREAD_POLLING_INTERVAL = 5_000;

/** Maximum documents per verification submission — confirmed at 5 (Section 7.3). */
export const MAX_VERIFICATION_DOCUMENTS = 5;
