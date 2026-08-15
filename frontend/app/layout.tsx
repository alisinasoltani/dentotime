// app/layout.tsx
import './globals.css';
import { Toaster } from 'sonner';
import ConditionalNavbar from '@/components/ConditionalNavbar';
import SecurityProvider from "@/components/SecurityProvider";
import { cn } from "@/lib/utils";
import localFont from 'next/font/local';

const vazirmatn = localFont({
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
      path: '../fonts/Vazirmatn-Bold.woff2',
      weight: '700',
      style: 'normal',
    },
  ],
  display: 'swap',
  preload: true,
});

export const metadata = {
  title: 'Dento Time',
  description: 'راهکارهای دقیق و تخصصی دندانپزشکی',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl" className={cn("scroll-smooth", "font-sans")}>
      <body className={`${vazirmatn.className} antialiased text-slate-800 bg-white`}>
        <SecurityProvider>
          <ConditionalNavbar />
          <main className="min-h-screen">
            {children}
            {/* اضافه کردن z-index بسیار بالا برای نمایش روی نوبار */}
            <Toaster position="top-center" richColors dir="rtl" style={{ zIndex: 99999 }} />
          </main>
        </SecurityProvider>
      </body>
    </html>
  );
}