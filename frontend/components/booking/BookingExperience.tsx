"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { toast } from "sonner";

import BookingModal from "@/components/user/booking-modal";
import { Button } from "@/components/ui/button";
import { getCurrentUser, restoreSession } from "@/lib/auth";
import { cn } from "@/lib/utils";


type BookingExperienceContextValue = {
  openBooking: (serviceSlug?: string, insurance?: string) => void;
};

const BookingExperienceContext = createContext<BookingExperienceContextValue | null>(null);

export function BookingExperienceProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [serviceSlug, setServiceSlug] = useState<string | undefined>();
  const [insurance, setInsurance] = useState<string | undefined>();

  const openBooking = useCallback((nextService?: string, nextInsurance?: string) => {
    void (async () => {
      try {
        if (!(await restoreSession())) {
          const destination = new URL(window.location.href);
          destination.searchParams.set("booking", "1");
          if (nextService) destination.searchParams.set("service", nextService);
          if (nextInsurance) destination.searchParams.set("insurance", nextInsurance);
          const returnTo = `${destination.pathname}${destination.search}${destination.hash}`;
          router.push(`/login?returnTo=${encodeURIComponent(returnTo)}`);
          return;
        }
        const user = await getCurrentUser();
        if (user.role !== "USER") {
          toast.error("رزرو نوبت فقط با حساب کاربری بیمار امکان‌پذیر است.");
          return;
        }
        setServiceSlug(nextService);
        setInsurance(nextInsurance);
        setIsOpen(true);
      } catch {
        router.push(`/login?returnTo=${encodeURIComponent(pathname)}`);
      }
    })();
  }, [pathname, router]);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    if (query.get("booking") !== "1") return;
    const nextService = query.get("service") || undefined;
    const nextInsurance = query.get("insurance") || undefined;
    query.delete("booking");
    query.delete("service");
    query.delete("insurance");
    const cleanUrl = `${window.location.pathname}${query.size ? `?${query}` : ""}${window.location.hash}`;
    window.history.replaceState(window.history.state, "", cleanUrl);
    openBooking(nextService, nextInsurance);
  }, [openBooking]);

  const value = useMemo(() => ({ openBooking }), [openBooking]);

  return (
    <BookingExperienceContext.Provider value={value}>
      {children}
      <BookingModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onSuccess={() => setIsOpen(false)}
        initialServiceSlug={serviceSlug}
        initialInsurance={insurance}
      />
    </BookingExperienceContext.Provider>
  );
}

export function useBookingExperience() {
  const value = useContext(BookingExperienceContext);
  if (!value) {
    throw new Error("useBookingExperience must be used inside BookingExperienceProvider");
  }
  return value;
}

export function BookingButton({
  serviceSlug,
  children = "رزرو نوبت",
  className,
}: {
  serviceSlug?: string;
  children?: ReactNode;
  className?: string;
}) {
  const { openBooking } = useBookingExperience();
  return (
    <Button
      type="button"
      onClick={() => openBooking(serviceSlug)}
      className={cn("h-11 cursor-pointer rounded-sm px-6", className)}
    >
      <CalendarDays data-icon="inline-start" aria-hidden="true" />
      {children}
    </Button>
  );
}
