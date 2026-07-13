import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: window.location.origin,
  basePath: "/api/auth",
  fetchOptions: {
    credentials: "include",
  },
});

/**
 * Browser sessions are stored only in Better Auth's HttpOnly cookie. This
 * callback remains as a compatibility no-op for existing form call sites.
 */
export function captureToken(): void {}

/**
 * Better Auth clears the browser session cookie during sign-out. No browser
 * token is stored in localStorage or sessionStorage.
 */
export function clearToken(): void {}
