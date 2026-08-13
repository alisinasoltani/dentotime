// hooks/useVerificationStatus.ts
import { useState, useEffect, useCallback } from "react";
import api from "@/lib/api";
import type { VerificationStatus } from "@/lib/types";

export function useVerificationStatus(enabled: boolean) {
  const [status, setStatus] = useState<VerificationStatus>("NOT_SUBMITTED");
  const [rejectionNote, setRejectionNote] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(enabled);
  const [hasResolved, setHasResolved] = useState(false);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await api.get("/doctors/verification/");
      const data = response.data;

      // Defensive check: backend might return 'status' or 'verification_status'
      const newStatus = data.status || data.verification_status;

      if (newStatus) {
        setStatus(newStatus);
        let note = data.rejection_note || null;
        if (note && typeof note === "string") {
          if (note.includes("|")) {
            // اگر متن شامل | بود، آن را جدا می‌کنیم
            const doctorNotePart = note
              .split("|")
              .find((part) => part.includes("یادداشت پزشک"));
            // اگر بخش یادداشت پزشک پیدا شد، فقط آن را نگه می‌داریم و کلمه "یادداشت پزشک:" را هم حذف می‌کنیم
            if (doctorNotePart) {
              note = doctorNotePart.replace("یادداشت پزشک:", "").trim();
            } else {
              // اگر فقط شامل | بود ولی یادداشت پزشک نداشت، کل متن را پاک می‌کنیم چون مربوط به ادمین است
              note = null;
            }
          } else if (note.includes("یادداشت ادمین")) {
            // اگر مستقیماً گفت یادداشت ادمین، آن را به دکتر نشان نده
            note = null;
          }
        }
        setRejectionNote(note);
      } else {
        // If neither field exists, default safely
        setStatus("NOT_SUBMITTED");
        setRejectionNote(null);
      }
    } catch (err: any) {
      // If 404, it means NOT_SUBMITTED. Log other errors for debugging.
      if (err.response?.status !== 404) {
        console.error("Failed to fetch verification status:", err);
      }
      setStatus("NOT_SUBMITTED");
      setRejectionNote(null);
    } finally {
      setHasResolved(true);
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (enabled) {
      refetch();
    }
  }, [enabled, refetch]);

  return {
    status,
    rejectionNote,
    isLoading: enabled && (!hasResolved || isLoading),
    refetch,
  };
}
