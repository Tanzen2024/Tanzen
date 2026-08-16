import { describe, it, expect } from 'vitest';
import { authService } from './auth.service';

describe('authService — local session (BACKEND PENDING, no real backend)', () => {
  it('starts unauthenticated when no session is stored', () => {
    expect(authService.isAuthenticated()).toBe(false);
  });

  it('login() creates a local session', async () => {
    await authService.login();
    expect(authService.isAuthenticated()).toBe(true);
  });

  it('logout() invalidates an active session', async () => {
    await authService.login();
    expect(authService.isAuthenticated()).toBe(true);
    await authService.logout();
    expect(authService.isAuthenticated()).toBe(false);
  });

  it('logout() removes the persisted session key entirely (not just marks it inactive)', async () => {
    await authService.login();
    await authService.logout();
    expect(localStorage.getItem('tanzen-session')).toBeNull();
  });

  it('isAuthenticated() reflects localStorage directly — no in-memory cache to go stale across a reload', async () => {
    await authService.login();
    // Simulates what a page reload would observe: a fresh read, not a
    // cached value from the module that called login().
    localStorage.removeItem('tanzen-session');
    expect(authService.isAuthenticated()).toBe(false);
  });
});
