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

/** Clear the BFF session, then optionally end the Entra SSO session too. */
export async function logout(): Promise<void> {
  try {
    const res = await fetch('/auth/logout', { method: 'POST', credentials: 'include' });
    const body = (await res.json().catch(() => ({}))) as { logoutUrl?: string };
    // The strict session cookie already protects logout from cross-site abuse.
    window.location.href = body.logoutUrl ?? '/';
  } catch {
    window.location.href = '/'; // hard reset regardless
  }
}
