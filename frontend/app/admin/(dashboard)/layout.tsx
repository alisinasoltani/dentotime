"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AdminSidebar from "@/components/admin/admin-sidebar";
import MobileSidebar from "@/components/admin/mobile-sidebar";
import { Loader2 } from "lucide-react";
import { getCurrentUser, restoreSession } from "@/lib/auth";

export default function AdminDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    let active = true;
    const authorize = async () => {
      const restored = await restoreSession();
      if (!restored || !active) return router.replace("/admin/login");
      const user = await getCurrentUser();
      if (!active) return;
      if (user.role !== "ADMIN") return router.replace("/admin/login");
      setIsAuthorized(true);
    };
    void authorize();
    return () => { active = false; };
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
