"use client";

import { toast } from "sonner";

export const GUEST_BOOKING_SUCCESS = "نوبت شما با موفقیت ثبت شد. برای مشاهده نوبت و پیگیری لطفا به حساب خود وارد شوید";
export const AUTHENTICATED_BOOKING_SUCCESS = "نوبت شما با موفقیت ذخیره شد";

function currentReturnTarget(): string {
  if (typeof window === "undefined") return "/";
  return `${window.location.pathname}${window.location.search}${window.location.hash || "#slots"}`;
}

export function showBookingSuccess(authenticated: boolean): void {
  if (authenticated) {
    toast.success(AUTHENTICATED_BOOKING_SUCCESS, { duration: 5000 });
    return;
  }

  toast.custom(
    (toastId) => (
      <div
        role="status"
        dir="rtl"
        data-testid="guest-booking-success"
        className="w-[min(92vw,430px)] rounded-2xl border border-emerald-200 bg-white p-4 text-right text-sm text-slate-800 shadow-lg"
      >
        <p data-testid="guest-booking-success-text" className="leading-7">
          {GUEST_BOOKING_SUCCESS}
        </p>
        <div className="mt-3 block w-full" data-testid="guest-booking-login-row">
          <button
            type="button"
            className="rounded-xl bg-[#2993A3] px-4 py-2 font-bold text-white outline-none transition-colors hover:bg-[#217b88] focus-visible:ring-2 focus-visible:ring-[#2993A3] focus-visible:ring-offset-2"
            onClick={() => {
              const returnTo = encodeURIComponent(currentReturnTarget());
              toast.dismiss(toastId);
              window.location.assign(`/login?returnTo=${returnTo}`);
            }}
          >
            ورود به حساب
          </button>
        </div>
      </div>
    ),
    { duration: 10_000 },
  );
}
