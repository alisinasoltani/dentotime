// hooks/useAuth.ts
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentUser, restoreSession } from '@/lib/auth';
import type { User } from '@/lib/types';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const router = useRouter();

  const refetch = useCallback(async () => {
    setIsLoading(true);
    try {
      const userData = await getCurrentUser();
      setUser(userData);
      setError(null);
      return userData;
    } catch (err) {
      setError(err as Error);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const loadSession = async () => {
      const restored = await restoreSession();
      if (!active) return;
      if (!restored) {
        setIsLoading(false);
        router.replace('/login');
        return;
      }
      await refetch();
    };
    void loadSession();
    return () => { active = false; };
  }, [router, refetch]);

  return { user, setUser, isLoading, error, refetch };
}
