"use client";

import { usePathname } from "next/navigation";
import Navbar from "@/components/Navbar";

export default function ConditionalNavbar() {
  const pathname = usePathname();

  const isDashboardRoute = ["/admin", "/doctor", "/user"].some(
    (root) => pathname === root || pathname?.startsWith(`${root}/`),
  );

  // Navbar فقط در پنل‌های خصوصی پنهان می‌شود؛ مسیر عمومی /doctors باید آن را نمایش دهد.
  if (isDashboardRoute) {
    return null;
  }

  // در سایر صفحات، Navbar نمایش داده می‌شود
  return <Navbar />;
}
