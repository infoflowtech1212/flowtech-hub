/**
 * Auth helpers for the Pure BFF pattern. The browser holds no tokens — sign-in
 * is a full-page redirect to the BFF, which runs Authorization Code + PKCE and
 * sets an httpOnly session cookie. Auth endpoints live at `/auth/*`, outside the
 * `/api` surface.
 */

/** Full-page navigation to begin sign-in, returning to the current path after. */
export function login(returnTo: string = window.location.pathname): void {
  window.location.href = `/auth/login?returnTo=${encodeURIComponent(returnTo)}`;
}

/** Clear the BFF session only — leaves the user's Microsoft 365 SSO session intact. */
export async function logout(): Promise<void> {
  try {
    await fetch('/auth/logout', { method: 'POST', credentials: 'include' });
  } catch {
    /* fall through to hard reset regardless */
  }
  window.location.href = '/';
}
