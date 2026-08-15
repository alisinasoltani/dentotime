"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import UserSidebar from "@/components/user/user-sidebar";
import MobileSidebar from "@/components/user/mobile-sidebar";
import { Loader2 } from "lucide-react";
import { getCurrentUser, restoreSession } from "@/lib/auth";

export default function UserLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [isAuth, setIsAuth] = useState(false);

  useEffect(() => {
    let active = true;
    const authorize = async () => {
      const restored = await restoreSession();
      // React Strict Mode may clean up an effect while its async work is
      // still finishing. A stale effect must never redirect the active route.
      if (!active) return;
      if (!restored) {
        router.replace("/login");
        return;
      }
      const user = await getCurrentUser();
      if (!active) return;
      if (user.role !== "USER") return router.replace("/login");
      setIsAuth(true);
    };
    void authorize();
    return () => { active = false; };
  }, [router]);

  if (!isAuth) return <div className="flex h-screen w-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-[#2993A3]" /></div>;

  return (
    <div className="admin-bg min-h-screen w-full flex">
      <div className="hidden lg:block h-screen sticky top-0">
        <UserSidebar />
      </div>
      <MobileSidebar />
      <main className="flex-1 min-h-screen p-4 lg:p-8 overflow-hidden">
        {children}
      </main>
    </div>
  );
}
