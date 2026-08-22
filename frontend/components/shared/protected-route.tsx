// components/shared/protected-route.tsx
'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useDoctorContext } from '@/context/doctor-context';
import { getRoleHomePath } from '@/lib/role-routing';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { 
    user, 
    isUserLoading, 
    verificationStatus, 
    isVerificationLoading 
  } = useDoctorContext();

  const isOnVerificationPage = pathname === '/doctor/verification';

  useEffect(() => {
    if (isUserLoading || (user && isVerificationLoading)) return;

    // 1. Not authenticated
    if (!user) {
      router.replace('/login');
      return;
    }

    // 2. Wrong Role (cross-role access guard)
    if (user.role !== 'DOCTOR') {
      router.replace(getRoleHomePath(user.role));
      return;
    }

    // 3. Verification Gate
    if (verificationStatus !== 'APPROVED' && !isOnVerificationPage) {
      // Force them to the verification page
      router.replace('/doctor/verification');
      return;
    }

    // 4. If approved and lingering on verification page, send to chat
    if (verificationStatus === 'APPROVED' && isOnVerificationPage) {
      router.replace('/doctor/chat');
      return;
    }
  }, [user, isUserLoading, verificationStatus, isVerificationLoading, isOnVerificationPage, router]);

  // Loading States
  if (isUserLoading || (user && isVerificationLoading)) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#2993A3]" />
      </div>
    );
  }

  // If not doctor or not authenticated, don't flash protected content
  if (!user || user.role !== 'DOCTOR') {
    return null;
  }

  // Enforce gate visually before router effect finishes
  if (verificationStatus !== 'APPROVED' && !isOnVerificationPage) {
    return null;
  }

  if (verificationStatus === 'APPROVED' && isOnVerificationPage) {
    return null;
  }

  return <>{children}</>;
}
