
'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { AuthUser } from '@/types';
import { getStoredUser, clearSession, isSessionValid } from '@/lib/auth';

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const storedUser = getStoredUser();
    if (storedUser && isSessionValid()) {
      setUser(storedUser);
    } else {
      clearSession();
    }
    setLoading(false);
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setUser(null);
    router.push('/login');
  }, [router]);

  const token = typeof window !== 'undefined' ? localStorage.getItem('kinematic_token') : null;
  const role = user?.role?.toLowerCase();
  const isPlatformAdmin = ['super_admin', 'admin', 'main_admin', 'sub_admin', 'platform_admin'].includes(role || '');

  return { 
    user, 
    loading, 
    logout, 
    isAuthenticated: !!user,
    token,
    isPlatformAdmin
  };
}
