"use client";

import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Menu } from "lucide-react";
import { useState } from "react";
import UserSidebar from "./user-sidebar";

export default function MobileSidebar() {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="icon" className="w-fit h-fit p-3 lg:hidden fixed top-4 left-4 z-50 bg-white border-[#5FB4FF] rounded-2xl">
          <span>مشاهده منو</span>
          <Menu className="h-6 w-6 mr-2" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="p-0 w-72 bg-transparent">
        <SheetTitle className="sr-only">منوی پنل کاربری</SheetTitle>
        <SheetDescription className="sr-only">دسترسی به بخش‌های پنل کاربری</SheetDescription>
        <UserSidebar onClose={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
