'use client';

import React, { useState } from 'react';
import axios from 'axios';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, ChevronLeft, CheckCircle2, ChevronRight } from 'lucide-react';
import Image from 'next/image';
import { toast } from 'sonner';
import Link from 'next/link';
import api from '@/lib/api';
import { notifyAuthSessionChanged, setAccessToken } from '@/lib/auth';
import { getRoleHomePath } from '@/lib/role-routing';
import type { AuthResponse } from '@/lib/types';

const demoAccounts = [
  {
    label: 'کاربر مجاز به ثبت نظر',
    description: 'یک مراجعه تأییدشده به دکتر آرمان حسینی',
    phone: '09121111101',
  },
  {
    label: 'کاربر غیرمجاز به ثبت نظر',
    description: 'فقط یک نوبت آینده با دکتر آرمان حسینی',
    phone: '09121111102',
  },
] as const;

const demoAccountsEnabled = process.env.NEXT_PUBLIC_ENABLE_DEMO_ACCOUNTS === 'true';
const frontendOnlyDemo = process.env.NEXT_PUBLIC_FRONTEND_DEMO_MODE === 'true';
const demoPassword = process.env.NEXT_PUBLIC_DEMO_ACCOUNT_PASSWORD || 'DemoRating123!';

type LoginErrorResponse = {
  detail?: unknown;
  phone_number?: unknown;
  password?: unknown;
};

function patientDestination(): string {
  if (typeof window === 'undefined') return '/user/';
  const returnTo = new URLSearchParams(window.location.search).get('returnTo');
  if (!returnTo?.startsWith('/')) return '/user/';
  try {
    const destination = new URL(returnTo, window.location.origin);
    if (destination.origin !== window.location.origin) return '/user/';
    return `${destination.pathname}${destination.search}${destination.hash}`;
  } catch {
    return '/user/';
  }
}

export default function LoginPage() {
  const router = useRouter();

  // --- UI States ---
  const [activeTab, setActiveTab] = useState<'doctor' | 'patient'>('doctor');
  const [showPassword, setShowPassword] = useState(false);

  // --- Form & API States ---
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Login is an explicit role-selection surface. Do not restore and redirect
  // an existing session here while the user is choosing a portal.
  const activeRoleLabel = activeTab === 'doctor' ? 'پزشکان' : 'مراجعان';

  // --- Handlers ---
  const selectRole = (role: 'doctor' | 'patient') => {
    setActiveTab(role);
    // A failed attempt for the other portal must not make the role controls
    // appear stuck or keep showing the previous portal's error.
    setError(null);
  };

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Convert Iranian phone format (0912...) to E.164 format (+98912...)
    let formattedPhone = phone.trim();
    if (formattedPhone.startsWith("09")) {
      formattedPhone = "+98" + formattedPhone.substring(1);
    }

    // Map the UI tab to the backend user_type
    const userType = activeTab === 'doctor' ? 'DOCTOR' : 'USER';

    try {
      const response = await api.post('/auth/login/', {
          phone_number: formattedPhone,
          password: password,
          user_type: userType
      });
      const data = response.data as AuthResponse;
      setAccessToken(data.access);
      notifyAuthSessionChanged();

      // --- Success Message (Sonner) ---
      toast.success("ورود موفقیت‌آمیز", {
        description: "در حال انتقال به حساب کاربری...",
        icon: <CheckCircle2 className="w-5 h-5 text-[#2993A3]" />,
        className: "bg-[#F0FAFC] border-[#9BD8E4] text-[#2993A3] font-bold font-sans",
        duration: 2000,
      });

      // --- Delay Redirect ---
      setTimeout(() => {
        router.replace(getRoleHomePath(data.user.role, patientDestination()));
      }, 1500);

    } catch (err: unknown) {
      const data = axios.isAxiosError<LoginErrorResponse>(err) ? err.response?.data : undefined;
      const errorMessage = data?.detail || data?.phone_number || data?.password || "اطلاعات ورود نامعتبر است.";
      setError(typeof errorMessage === 'string' ? errorMessage : "اطلاعات ورود نامعتبر است.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center p-4 bg-slate-300 bg-cover bg-center"
      style={{ backgroundImage: "url('/images/login_bg.png')" }}
    >
      <div
        dir="rtl"
        className="w-full max-w-[420px] rounded-[40px] p-8 flex flex-col gap-6"
        style={{
          backgroundColor: 'rgba(242, 242, 242, 0.60)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          boxShadow: 'none'
        }}
      >

        {/* --- Row 1: Title & Logo --- */}
        <div className="flex items-center justify-center gap-3">
          <h1 className="text-md md:text-xl font-bold text-slate-800">
            ورود به حساب کاربری
          </h1>
          <div className="w-10 h-10 flex items-center justify-center">
            <Image src={"/images/logo.png"} width={55} height={48} alt="" />
          </div>
        </div>

        <button
          type="button"
          onClick={() => router.back()}
          className="flex items-center gap-1 text-sm font-bold text-slate-700 hover:text-[#009BB2] transition-colors"
        >
          <ChevronRight size={18} strokeWidth={2.5} />
          بازگشت
        </button>

        {/* --- Row 2: Tabs --- */}
        <div className="w-full bg-[#ffffff] rounded-full p-1 flex mt-2">
          <button
            type="button"
            aria-pressed={activeTab === 'doctor'}
            onClick={() => selectRole('doctor')}
            className={`flex-1 py-2.5 rounded-full text-xs md:text-sm font-bold transition-all duration-300 ${activeTab === 'doctor'
              ? 'bg-[#72BFC6] text-white shadow-sm'
              : 'bg-transparent text-slate-600 hover:bg-slate-50'
              }`}
          >
            بخش پزشکان
          </button>
          <button
            type="button"
            aria-pressed={activeTab === 'patient'}
            onClick={() => selectRole('patient')}
            className={`flex-1 py-2.5 rounded-full text-xs md:text-sm font-bold transition-all duration-300 ${activeTab === 'patient'
              ? 'bg-[#72BFC6] text-white shadow-sm'
              : 'bg-transparent text-slate-600 hover:bg-slate-50'
              }`}
          >
            بخش مراجعان
          </button>
        </div>

        <p
          aria-live="polite"
          className="-mt-3 text-center text-xs font-bold text-[#176D78]"
        >
          ورود به بخش {activeRoleLabel}
        </p>

        {demoAccountsEnabled ? (
          <section className="rounded-2xl border border-[#9BD8E4] bg-[#F0FAFC]/90 p-3" aria-labelledby="demo-accounts-title">
            <h2 id="demo-accounts-title" className="text-sm font-black text-[#176D78]">
              ورود سریع با حساب آزمایشی
            </h2>
            {frontendOnlyDemo ? (
              <p className="mt-1 text-[11px] font-bold text-[#2993A3]">
                حالت مستقل فرانت‌اند؛ بدون نیاز به اجرای Backend
              </p>
            ) : null}
            <div className="mt-2 grid gap-2">
              {demoAccounts.map((account) => (
                <button
                  key={account.phone}
                  type="button"
                  className="min-h-11 rounded-xl border border-[#B9E1E6] bg-white px-3 py-2 text-right transition-colors hover:border-[#2993A3] hover:bg-[#F7FDFE]"
                  onClick={() => {
                    selectRole('patient');
                    setPhone(account.phone);
                    setPassword(demoPassword);
                    setError(null);
                  }}
                >
                  <strong className="block text-xs text-[#176D78]">{account.label}</strong>
                  <span className="mt-1 block text-[11px] leading-5 text-slate-600">{account.description}</span>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {/* ================= Login Form ================= */}
        <form onSubmit={handleLogin} className="flex flex-col gap-5 mt-2">

          {/* --- Row 3: Phone Input --- */}
          <div className="flex flex-col gap-2">
            <label htmlFor="login-phone" className="text-sm font-bold text-slate-800 mr-2">شماره تلفن همراه:</label>
            <input
              id="login-phone"
              type="tel"
              dir="ltr"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full bg-white/90 rounded-full px-5 py-2.5 outline-none focus:ring-2 focus:ring-[#72BFC6] transition-all text-left"
              placeholder="09..."
              required
            />
          </div>

          {/* --- Row 4: Password Input --- */}
          <div className="flex flex-col gap-2">
            <label htmlFor="login-password" className="text-sm font-bold text-slate-800 mr-2">رمز عبور:</label>
            <div className="relative w-full">
              <input
                id="login-password"
                type={showPassword ? "text" : "password"}
                dir="ltr"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-white/90 rounded-full pl-12 pr-5 py-2.5 outline-none focus:ring-2 focus:ring-[#72BFC6] transition-all text-left tracking-widest"
                // placeholder="••••••••"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-[#009BB2] transition-colors"
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-red-500 text-xs font-bold text-center mt-[-10px]">{error}</p>
          )}

          {/* --- Row 5: Submit Button --- */}
          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 rounded-full bg-[linear-gradient(90deg,#2993A3_0%,#75C1C7_100%)] py-2.5 md:py-3 text-xs md:text-base font-bold text-white transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {loading ? 'در حال ورود...' : 'ورود به حساب کاربری'}
          </button>
        </form>

        {/* --- Row 6: Separator --- */}
        <div className="w-full h-px bg-white/80 my-2"></div>

        {/* --- Row 7: Signup Section --- */}
        <div className="flex flex-col items-start gap-4 justify-between px-0">
          <span className="text-xs md:text-sm font-bold text-slate-800">حساب کاربری ندارید؟</span>
          <button
            type="button"
            onClick={() => router.push('/signup')}
            className="w-full border-[2px] border-[#009BB2] text-[#009BB2] bg-transparent font-bold text-xs md:text-sm rounded-[28px] px-6 py-2 transition-all hover:bg-[#009BB2] hover:text-white"
          >
            ثبت نام کنید
          </button>
        </div>

        {/* --- Row 8 & 9: Links --- */}
        <div className="flex flex-col gap-3 mt-1 px-2">
          {/* <button className="flex items-center gap-1 text-[#009BB2] hover:text-[#007A8D] transition-colors w-fit">
            <ChevronLeft size={18} strokeWidth={2.5} />
            <span className="text-xs md:text-sm font-bold">ورود با رمز یکبار مصرف</span>
          </button> */}

          <Link href={"/forgot-password"}>
            <button className="flex items-center gap-1 text-[#009BB2] hover:text-[#007A8D] transition-colors w-fit">
              <ChevronLeft size={18} strokeWidth={2.5} />
              <span className="text-xs md:text-sm font-bold">فراموشی رمز عبور</span>
            </button>
          </Link>
        </div>

      </div>
    </div>
  );
}
