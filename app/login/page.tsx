'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, ChevronLeft, CheckCircle2, ChevronRight } from 'lucide-react';
import Image from 'next/image';
import { toast } from 'sonner';
import Link from 'next/link';
import api from '@/lib/api';
import { getCurrentUser, restoreSession, setAccessToken } from '@/lib/auth';

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

  // --- Redirect if already logged in ---
  useEffect(() => {
    let active = true;
    const redirectExistingSession = async () => {
      if (!(await restoreSession()) || !active) return;
      const user = await getCurrentUser();
      if (!active) return;
      if (user.role === 'DOCTOR') {
        router.push("/doctor/");
      } else if (user.role === 'ADMIN') {
        router.push("/admin/");
      } else {
        router.push("/user/");
      }
    };
    void redirectExistingSession();
    return () => { active = false; };
  }, [router]);

  // --- Handlers ---
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
      const data = response.data;
      setAccessToken(data.access);

      // --- Success Message (Sonner) ---
      toast.success("ورود موفقیت‌آمیز", {
        description: "در حال انتقال به حساب کاربری...",
        icon: <CheckCircle2 className="w-5 h-5 text-[#2993A3]" />,
        className: "bg-[#F0FAFC] border-[#9BD8E4] text-[#2993A3] font-bold font-sans",
        duration: 2000,
      });

      // --- Delay Redirect ---
      setTimeout(() => {
        if (userType === 'DOCTOR') {
          router.push("/doctor/");
        } else {
          router.push("/user/");
        }
      }, 1500);

    } catch (err: any) {
      const data = err.response?.data;
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
            <Image src={"/images/logo.png"} width={40} height={40} alt="" />
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
            onClick={() => setActiveTab('doctor')}
            className={`flex-1 py-2.5 rounded-full text-xs md:text-sm font-bold transition-all duration-300 ${activeTab === 'doctor'
              ? 'bg-[#72BFC6] text-white shadow-sm'
              : 'bg-transparent text-slate-600 hover:bg-slate-50'
              }`}
          >
            بخش پزشکان
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('patient')}
            className={`flex-1 py-2.5 rounded-full text-xs md:text-sm font-bold transition-all duration-300 ${activeTab === 'patient'
              ? 'bg-[#72BFC6] text-white shadow-sm'
              : 'bg-transparent text-slate-600 hover:bg-slate-50'
              }`}
          >
            بخش مراجعان
          </button>
        </div>

        {/* ================= Login Form ================= */}
        <form onSubmit={handleLogin} className="flex flex-col gap-5 mt-2">

          {/* --- Row 3: Phone Input --- */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-bold text-slate-800 mr-2">شماره تلفن همراه:</label>
            <input
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
            <label className="text-sm font-bold text-slate-800 mr-2">رمز عبور:</label>
            <div className="relative w-full">
              <input
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
