// context/doctor-context.tsx
'use client';

import React, { createContext, useContext } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useVerificationStatus } from '@/hooks/useVerificationStatus';
import type { User, VerificationStatus } from '@/lib/types';

interface DoctorContextType {
  user: User | null;
  isUserLoading: boolean;
  refetchUser: () => Promise<User | undefined>;
  verificationStatus: VerificationStatus;
  rejectionNote: string | null;
  isVerificationLoading: boolean;
  refetchVerificationStatus: () => Promise<void>;
}

const DoctorContext = createContext<DoctorContextType | undefined>(undefined);

export function DoctorProvider({ children }: { children: React.ReactNode }) {
  const { user, isLoading: isUserLoading, refetch } = useAuth();
  
  // Only fetch verification status if the user is confirmed to be a doctor
  const isDoctor = user?.role === 'DOCTOR';
  const { 
    status, 
    rejectionNote, 
    isLoading: isVerificationLoading, 
    refetch: refetchVerification 
  } = useVerificationStatus(isDoctor);

  return (
    <DoctorContext.Provider
      value={{
        user,
        isUserLoading,
        refetchUser: refetch,
        verificationStatus: status,
        rejectionNote,
        isVerificationLoading,
        refetchVerificationStatus: refetchVerification,
      }}
    >
      {children}
    </DoctorContext.Provider>
  );
}

export function useDoctorContext() {
  const ctx = useContext(DoctorContext);
  if (!ctx) throw new Error('useDoctorContext must be used within DoctorProvider');
  return ctx;
}