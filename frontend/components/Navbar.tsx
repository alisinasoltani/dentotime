"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Menu, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useBookingExperience } from "@/components/booking/BookingExperience";
import { AUTH_SESSION_EVENT, getCurrentUser, restoreSession } from "@/lib/auth";
import type { UserRole } from "@/lib/types";

const navItems = [
  { label: "صفحه اصلی", href: "/" },
  { label: "خدمات", href: "/#services" },
  { label: "پزشکان", href: "/doctors" },
  { label: "فناوری‌ها", href: "/#technologies" },
  { label: "تفاوت ما", href: "/#features" },
  { label: "تماس با ما", href: "/#contact" },
];

export default function Navbar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [role, setRole] = useState<UserRole | null>(null);
  const { openBooking } = useBookingExperience();
  const isAuthenticationRoute = ["/login", "/signup", "/forgot-password"].includes(pathname ?? "");

  useEffect(() => {
    // Authentication pages must remain an explicit user choice. A stale
    // refresh cookie or session marker can otherwise make the background
    // /users/me request reload /login while the user is switching portals.
    if (isAuthenticationRoute) {
      return;
    }

    let requestVersion = 0;
    const syncSession = async () => {
      const version = ++requestVersion;
      try {
        if (!(await restoreSession())) {
          if (version === requestVersion) setRole(null);
          return;
        }
        const user = await getCurrentUser();
        if (version === requestVersion) setRole(user.role);
      } catch {
        if (version === requestVersion) setRole(null);
      }
    };
    void syncSession();
    window.addEventListener(AUTH_SESSION_EVENT, syncSession);
    return () => {
      requestVersion += 1;
      window.removeEventListener(AUTH_SESSION_EVENT, syncSession);
    };
  }, [isAuthenticationRoute]);

  const visibleRole = isAuthenticationRoute ? null : role;
  const panelHref = visibleRole === "USER" ? "/user" : visibleRole === "DOCTOR" ? "/doctor" : "/admin";
  const panelLabel = visibleRole === "USER" ? "پنل کاربری" : visibleRole === "DOCTOR" ? "پنل پزشک" : "پنل مدیریت";

  return (
    <>
    <header className="fixed inset-x-0 top-0 z-40 border-b border-[#DCEFF1] bg-white/95 backdrop-blur-xl" dir="rtl">
      <div className="mx-auto flex h-16 w-full items-center gap-3 px-4 sm:px-6 lg:h-[72px] lg:px-8">
        <Link href="/" className="flex shrink-0 items-center gap-2" aria-label="دنتوتایم، صفحه اصلی">
          <Image src="/images/logo.png" alt="دنتوتایم" width={55} height={48} priority className="object-contain" />
        </Link>

        <nav className="mr-6 hidden flex-1 items-center justify-center gap-6 lg:flex" aria-label="منوی اصلی">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="relative py-3 text-sm font-semibold text-[#444] transition-colors after:absolute after:inset-x-0 after:bottom-1 after:mx-auto after:h-0.5 after:w-0 after:rounded-full after:bg-[#2993A3] after:transition-all hover:text-[#2993A3] hover:after:w-full focus-visible:rounded focus-visible:outline-3 focus-visible:outline-[#75C1C7]/45"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="mr-auto flex items-center gap-2">
          <Button asChild variant="outline" className="hidden h-11 rounded-sm cursor-pointer border-[#2993A3] bg-white px-5 font-bold text-[#2993A3] hover:bg-[#EFFAFB] sm:inline-flex">
            <Link href={visibleRole ? panelHref : "/login"}>
              {visibleRole ? panelLabel : "ورود و ثبت نام"}
            </Link>
          </Button>
          <Button
            type="button"
            onClick={() => openBooking()}
            className="h-10 rounded-sm cursor-pointer bg-[linear-gradient(90deg,#2993A3_0%,#75C1C7_100%)] px-3 font-bold text-white shadow-[0_8px_24px_rgba(41,147,163,0.22)] hover:brightness-95 sm:h-11 sm:px-5"
          >
            <CalendarDays data-icon="inline-start" aria-hidden="true" />
            <span className="hidden sm:inline">رزرو نوبت</span>
            <span className="sm:hidden">رزرو</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setMobileOpen((current) => !current)}
            className="size-11 rounded-full text-[#2993A3] lg:hidden"
            aria-expanded={mobileOpen}
            aria-controls="mobile-navigation"
            aria-label={mobileOpen ? "بستن منو" : "باز کردن منو"}
          >
            {mobileOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          </Button>
        </div>
      </div>

      {mobileOpen && (
        <nav id="mobile-navigation" className="border-t border-[#DCEFF1] bg-white px-4 pb-5 pt-3 lg:hidden" aria-label="منوی موبایل">
          <div className="mx-auto grid max-w-[680px] grid-cols-2 gap-2">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className="flex min-h-11 items-center rounded-sm px-3 text-sm font-bold text-[#444] hover:bg-[#EFFAFB] hover:text-[#2993A3]"
              >
                {item.label}
              </Link>
            ))}
            <Link
              href={visibleRole ? panelHref : "/login"}
              onClick={() => setMobileOpen(false)}
              className="col-span-2 min-h-11 rounded-sm border border-[#2993A3] text-sm font-bold text-[#2993A3] sm:hidden"
            >
              <span className="flex min-h-11 items-center justify-center">
                {visibleRole ? panelLabel : "ورود و ثبت نام"}
              </span>
            </Link>
          </div>
        </nav>
      )}
    </header>
    <div className="h-[65px] lg:h-[72px]" aria-hidden="true" />
    </>
  );
}
