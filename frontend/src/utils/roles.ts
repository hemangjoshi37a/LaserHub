import type { User } from '../services';

/**
 * Role helpers for gating UI on the current user's backend-provided role.
 *
 * Note: the `User` interface in `src/services/index.ts` currently declares
 * `role?: string` (optional loose string), not a narrowed union. We keep the
 * exported `UserRole` union here as the canonical client-side vocabulary so
 * call sites can import and reuse it. Backend is the source of truth for role;
 * these helpers trust only `user.role === <literal>` — they do NOT fall back
 * to email matching or `is_admin`.
 */
export type UserRole = 'customer' | 'vendor' | 'super_admin';

export function isSuperAdmin(user: User | null | undefined): boolean {
  if (!user) return false;
  return user.role === 'super_admin' || user.role === 'admin' || user.is_admin === true;
}

export function isVendor(user: User | null | undefined): boolean {
  if (!user) return false;
  // admins implicitly have vendor capability for gating purposes.
  return user.role === 'vendor' || isSuperAdmin(user);
}

/** Format a raw role string for display: "super_admin" -> "Super Admin" */
export function formatRole(role: string | null | undefined, isAdmin?: boolean): string {
  if (!role) return isAdmin ? 'Admin' : 'Customer';
  return role
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}
