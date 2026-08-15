// app/doctor/layout.tsx
import { DoctorProvider } from '@/context/doctor-context';
import { ProtectedRoute } from '@/components/shared/protected-route';
import { DoctorSidebar } from '@/components/doctor/doctor-sidebar';
import { MobileSidebar } from '@/components/doctor/mobile-sidebar';

export default function DoctorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
        <main className="relative flex-1 flex flex-col w-full min-w-0 pt-16 lg:pt-0">
          
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