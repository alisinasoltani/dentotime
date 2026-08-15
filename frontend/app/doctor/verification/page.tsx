// app/doctor/verification/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useDoctorContext } from '@/context/doctor-context';
import { VerificationForm } from '@/components/doctor/verification-form';
import { VerificationStatusPending } from '@/components/doctor/verification-status-pending';
import { VerificationStatusRejected } from '@/components/doctor/verification-status-rejected';
import { Loader2 } from 'lucide-react';

export default function VerificationPage() {
  const { verificationStatus, rejectionNote, isVerificationLoading } = useDoctorContext();
  
  // Tracks the "متوجه شدم" click. Resets if the server status changes.
  const [acknowledged, setAcknowledged] = useState(false);

  useEffect(() => {
    if (verificationStatus !== 'REJECTED') {
      setAcknowledged(false);
    }
  }, [verificationStatus]);

  if (isVerificationLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#2993A3]" />
      </div>
    );
  }

  // State Machine Wiring
  if (verificationStatus === 'PENDING') {
    return <VerificationStatusPending />;
  }

  if (verificationStatus === 'REJECTED' && !acknowledged) {
    return (
      <VerificationStatusRejected
        rejectionNote={rejectionNote}
        onAck={() => setAcknowledged(true)}
      />
    );
  }

  // NOT_SUBMITTED OR (REJECTED + acknowledged)
  return <VerificationForm />;
}