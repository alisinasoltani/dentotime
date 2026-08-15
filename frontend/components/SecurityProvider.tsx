"use client";

/**
 * Compatibility wrapper retained for existing layouts.
 *
 * Browser developer tools and native context menus are user-controlled and
 * cannot provide an application security boundary. Authorization, data
 * protection, and security headers are enforced by the server instead.
 */
export default function SecurityProvider({ children }: { children: React.ReactNode }) {
  return children;
}
