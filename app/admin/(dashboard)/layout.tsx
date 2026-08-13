"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AdminSidebar from "@/components/admin/admin-sidebar";
import MobileSidebar from "@/components/admin/mobile-sidebar";
import { Loader2 } from "lucide-react";

export default function AdminDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    const userRole = localStorage.getItem("user_role");

    // اگر توکن نداشت یا ادمین نبود، به صفحه لاگین ادمین پرتاب شود
    if (!token || userRole !== "ADMIN") {
      router.replace("/admin/login");
    } else {
      setIsAuthorized(true);
    }
  }, [router]);

  // نمایش لودر تا زمانی که بررسی توکن تمام شود
  if (!isAuthorized) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#2993A3]" />
      </div>
    );
  }

  return (
    <div className="admin-bg min-h-screen w-full flex">
      {/* Desktop Sidebar - Fixed */}
      <div className="hidden lg:block h-screen sticky top-0">
        <AdminSidebar />
      </div>

      {/* Mobile Sidebar Trigger */}
      <MobileSidebar />

      {/* Main Content Area */}
      <main className="flex-1 min-h-screen p-4 lg:p-8 overflow-hidden">
        {children}
      </main>
    </div>
  );
}