// components/doctor/mobile-sidebar.tsx
'use client';

import { useState } from 'react';
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Menu } from 'lucide-react';
import { SidebarContent } from './doctor-sidebar';
import { Button } from '@/components/ui/button';

export function MobileSidebar() {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden absolute top-4 right-4 z-50 h-10 w-10 rounded-lg border border-gray-200 bg-white"
          aria-label="باز کردن منو"
        >
          <Menu className="h-5 w-5 text-[#2993A3]" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-72 p-0">
        <SheetTitle className="sr-only">منوی پنل پزشک</SheetTitle>
        <SheetDescription className="sr-only">دسترسی به بخش‌های پنل پزشک</SheetDescription>
        <SidebarContent onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
