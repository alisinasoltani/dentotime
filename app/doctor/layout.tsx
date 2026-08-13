"use client";
import { DoctorProvider } from '@/context/doctor-context';
import { ProtectedRoute } from '@/components/shared/protected-route';
import { DoctorSidebar } from '@/components/doctor/doctor-sidebar';
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import UserSidebar from "@/components/user/user-sidebar";
import MobileSidebar from "@/components/user/mobile-sidebar";
import { Loader2 } from "lucide-react";

export default function DoctorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [isAuth, setIsAuth] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    const role = localStorage.getItem("user_role");
    if (!token || (role !== "DOCTOR")) {
      router.replace("/login");
    } else {
      setIsAuth(true);
    }
  }, [router]);

  if (!isAuth) return <div className="flex h-screen w-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-[#2993A3]" /></div>;

  return (
    // 1. Context Provider: Wraps everything so sidebar, pages, and route 
    //    guard share the exact same user/verification data without re-fetching.
    <DoctorProvider>
      {/* 
        2. Layout Shell: 
        - flex (default row in RTL means right-to-left flow)
        - h-screen & overflow-hidden to prevent body scroll, allowing inner 
          pages (like chat) to manage their own scroll areas.
      */}
      <div className="flex h-screen w-full overflow-hidden bg-[#F8FBFC]">

        {/* 3. Desktop Sidebar (hidden on mobile/tablet) */}
        <DoctorSidebar />

        {/* 4. Mobile Sidebar (renders the hamburger trigger + Sheet drawer) */}
        <MobileSidebar />

        {/* 
          5. Main Content Area
          - flex-1 to fill remaining width
          - pt-16 on mobile to clear the fixed hamburger button
          - min-w-0 prevents flex children from overflowing horizontally 
            (crucial for chat window responsiveness)
        */}
        <main className="relative flex-1 flex flex-col w-full min-w-0 pt-20 lg:pt-0">

          {/* 6. Routing Gate: Enforces auth & verification status rules */}
          <ProtectedRoute>
            <div className="flex-1 w-full overflow-y-auto">
              {children}
            </div>
          </ProtectedRoute>

        </main>
      </div>
    </DoctorProvider>
  );
}