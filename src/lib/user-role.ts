// Copyright © 2026 Browns Studio

export type UserRole = 'doctor' | 'patient' | 'dispensary';

export function saveUserRole(role: UserRole): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem('trustleaf_role', role);
  }
}

export function getUserRole(): UserRole | null {
  if (typeof window !== 'undefined') {
    return (localStorage.getItem('trustleaf_role') as UserRole) ?? null;
  }
  return null;
}

export function clearUserRole(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('trustleaf_role');
  }
}
