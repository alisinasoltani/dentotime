// app/layout.tsx
import './globals.css';
import { Toaster } from 'sonner';
import ConditionalNavbar from '@/components/ConditionalNavbar';
import SecurityProvider from "@/components/SecurityProvider";
import { cn } from "@/lib/utils";
import localFont from 'next/font/local';
import { BookingExperienceProvider } from '@/components/booking/BookingExperience';

const persianSans = localFont({
  src: [
    {
      path: '../fonts/Vazirmatn-Regular.woff2',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../fonts/Vazirmatn-Medium.woff2',
      weight: '500',
      style: 'normal',
    },
    {
      path: '../fonts/Vazirmatn-SemiBold.woff2',
      weight: '600',
      style: 'normal',
    },
    {
      path: '../fonts/Vazirmatn-Bold.woff2',
      weight: '700',
      style: 'normal',
    },
    {
      path: '../fonts/Vazirmatn-ExtraBold.woff2',
      weight: '800',
      style: 'normal',
    },
    {
      path: '../fonts/Vazirmatn-Black.woff2',
      weight: '900',
      style: 'normal',
    },
  ],
  display: 'swap',
  preload: true,
  variable: '--font-persian-sans',
});

export const metadata = {
  title: 'دنتوتایم | رزرو آنلاین خدمات دندان‌پزشکی',
  description: 'مقایسه خدمات و دندان‌پزشکان، بررسی بیمه و رزرو نوبت آنلاین',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl" className={cn("scroll-smooth", "font-sans", persianSans.variable)}>
      <body className={`${persianSans.className} antialiased text-[#111] bg-white`}>
        <SecurityProvider>
          <BookingExperienceProvider>
            <ConditionalNavbar />
            <main className="min-h-screen">
              {children}
              <Toaster position="top-center" richColors dir="rtl" />
            </main>
          </BookingExperienceProvider>
        </SecurityProvider>
      </body>
    </html>
  );
}
