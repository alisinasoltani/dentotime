"use client";

import { usePathname } from "next/navigation";
import Navbar from "@/components/Navbar";

export default function ConditionalNavbar() {
  const pathname = usePathname();

  // اگر کاربر در مسیر پنل ادمین (/admin) باشد، Navbar اصلا رندر نمی‌شود
  if (pathname?.startsWith("/admin") || pathname?.startsWith("/doctor") || pathname?.startsWith("/user")) {
    return null;
  }

  // در سایر صفحات، Navbar نمایش داده می‌شود
  return <Navbar />;
}