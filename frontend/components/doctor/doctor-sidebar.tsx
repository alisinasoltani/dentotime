'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { MessageSquare, ShieldCheck, Pencil, LogOut, Star } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useDoctorContext } from '@/context/doctor-context';
import { clearTokens } from '@/lib/auth';
import { cn } from '@/lib/utils';

const navItems = [
  { title: 'گفت و گو ها', href: '/doctor/chat', icon: MessageSquare },
  { title: 'احراز هویت', href: '/doctor/verification', icon: ShieldCheck },
  { title: 'امتیازهای من', href: '/doctor/ratings', icon: Star },
];

export function SidebarContent() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, verificationStatus } = useDoctorContext();

  const isApproved = verificationStatus === 'APPROVED';
  const avatarSrc = user?.profile_picture && user.profile_picture.trim() !== "" ? user.profile_picture : undefined;

  const handleLogout = () => {
    clearTokens();
    router.push('/login');
  };

  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <div className="px-2 pt-4">
        <h1 className="text-lg font-bold text-gray-800">
          داشبورد پزشکان دنتوتایم
        </h1>
      </div>

      <nav className="flex flex-1 flex-col gap-2 px-2">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const isDisabled = item.href === '/doctor/chat' && !isApproved;

          return (
            <Link
              key={item.href}
              href={isDisabled ? '#' : item.href}
              onClick={(e) => isDisabled && e.preventDefault()}
              aria-disabled={isDisabled}
              className={cn(
                'flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-linear-to-l from-[#FFFFFF] to-[#D4EBF3] text-[#2993A3]'
                  : 'text-gray-600 hover:bg-gray-50',
                isDisabled && 'pointer-events-none opacity-50'
              )}
            >
              <item.icon className="h-5 w-5" />
              <span>{item.title}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mx-2 mb-4 rounded-2xl border border-[#5FB4FF] bg-[#F8FBFC] p-4">
        <div className="flex items-center gap-3">
          <Avatar className="h-12 w-12 border-2 border-[#5FB4FF]">
            <AvatarImage src={avatarSrc} alt="profile" />
            <AvatarFallback className="bg-[#E9F5F9] text-[#2993A3]">
              {user?.first_name?.charAt(0) || 'پ'}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col">
            <p className="text-sm font-medium text-black">
              {user ? `${user.first_name} ${user.last_name}` : 'در حال بارگذاری...'}
            </p>
            <button
              onClick={() => router.push('/doctor/edit-info')}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-[#2993A3] mt-1 transition-colors"
            >
              <Pencil className="h-3 w-3" />
              تغییر نام یا پروفایل
            </button>
          </div>
        </div>
      </div>

      <div className="px-2 pb-4">
        <button
          onClick={handleLogout}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-100 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-100"
        >
          <LogOut className="h-4 w-4" />
          خروج از حساب کاربری
        </button>
      </div>
    </div>
  );
}

export function DoctorSidebar() {
  return (
    <aside className="hidden lg:block w-72 shrink-0 border-l border-gray-100 bg-white">
      <SidebarContent />
    </aside>
  );
}
