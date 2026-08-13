'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, ChevronRight } from 'lucide-react'; // ChevronRight اضافه شد
import Image from 'next/image';
import { toast } from 'sonner';
import api from '@/lib/api';
import { OTPVerification } from '@/components/ui/otp-input';

export default function SignupPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'doctor' | 'patient'>('doctor');
  const [step, setStep] = useState(1); // 1: Phone, 2: OTP, 3: Password & Name

  const [phone, setPhone] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [otp, setOtp] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const formatPhone = (p: string) => p.startsWith("09") ? "+98" + p.substring(1) : p;

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError(null);
    try {
      await api.post('/auth/request-otp/', { phone_number: formatPhone(phone) });
      toast.success("کد تایید ارسال شد.");
      setStep(2);
    } catch (err: any) { 
      const errorData = err.response?.data;
      setError(errorData?.detail || "خطا در ارسال کد."); 
    }
    finally { setLoading(false); }
  };

  const handleVerifyOtp = async (code: string) => {
    try {
      await api.post('/auth/verify-otp/', { phone_number: formatPhone(phone), code });
      setOtp(code);
      setTimeout(() => setStep(3), 1500); 
      return true;
    } catch (err: any) {
      return false;
    }
  };

  const handleResendOtp = async () => {
    try {
      await api.post('/auth/request-otp/', { phone_number: formatPhone(phone) });
      toast.success("کد جدید ارسال شد.");
    } catch (err: any) {
      toast.error("خطا در ارسال مجدد کد.");
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    if (password !== passwordConfirm) { setError("رمز عبور و تکرار آن یکسان نیستند."); setLoading(false); return; }

    try {
      const res = await api.post('/auth/signup/', {
        user_type: activeTab === 'doctor' ? 'DOCTOR' : 'USER',
        phone_number: formatPhone(phone),
        password: password,
        password_confirm: passwordConfirm,
        first_name: firstName,
        last_name: lastName,
        otp_code: otp
      });

      if (res.data.access && res.data.refresh) {
        localStorage.setItem("access_token", res.data.access);
        localStorage.setItem("refresh_token", res.data.refresh);
        localStorage.setItem("user_role", res.data.user.role);

        toast.success("ثبت نام موفقیت‌آمیز بود");
        setTimeout(() => router.push(activeTab === 'doctor' ? "/doctor/" : "/user/"), 1500);
      } else {
        toast.success("حساب ایجاد شد. لطفاً وارد شوید.");
        setTimeout(() => router.push("/login"), 1500);
      }
    } catch (err: any) {
      const errorData = err.response?.data;
      let errorMessage = "خطا در ثبت‌نام.";
      if (errorData) {
        if (errorData.detail) {
          errorMessage = errorData.detail;
        } else {
          errorMessage = Object.values(errorData).flat().join(" ");
        }
      }
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-slate-300 bg-cover bg-center" style={{ backgroundImage: "url('/images/login_bg.png')" }}>
      <div dir="rtl" className="w-full max-w-[420px] rounded-[40px] p-8 flex flex-col gap-6 my-8 relative" style={{ backgroundColor: 'rgba(242, 242, 242, 0.60)', backdropFilter: 'blur(16px)' }}>

        {/* دکمه بازگشت در مرحله ۲ (بازگشت به ورودی شماره تلفن) */}
        {step === 2 && (
          <button 
            type="button" 
            onClick={() => setStep(1)} 
            className="absolute top-8 right-8 flex items-center gap-1 text-sm font-bold text-slate-700 hover:text-[#009BB2] transition-colors"
          >
            <ChevronRight size={18} strokeWidth={2.5} />
            بازگشت
          </button>
        )}

        <div className="flex items-center justify-center gap-3">
          <h1 className="text-md md:text-xl font-bold text-slate-800">ساخت حساب کاربری</h1>
          <Image src={"/images/logo.png"} width={40} height={40} alt="" />
        </div>

                
        {/* دکمه بازگشت در مرحله ۱ (بازگشت به صفحه قبلی) */}
        {step === 1 && (
          <button 
            type="button" 
            onClick={() => router.back()} 
            className="flex items-center gap-1 text-sm font-bold text-slate-700 hover:text-[#009BB2] transition-colors"
          >
            <ChevronRight size={18} strokeWidth={2.5} />
            بازگشت
          </button>
        )}

        {step === 3 && (
          <div className="w-full bg-[#ffffff] rounded-full p-1 flex">
            <button onClick={() => setActiveTab('doctor')} className={`flex-1 py-2.5 rounded-full text-xs font-bold ${activeTab === 'doctor' ? 'bg-[#72BFC6] text-white' : 'text-slate-600'}`}>بخش پزشکان</button>
            <button onClick={() => setActiveTab('patient')} className={`flex-1 py-2.5 rounded-full text-xs font-bold ${activeTab === 'patient' ? 'bg-[#72BFC6] text-white' : 'text-slate-600'}`}>بخش مراجعان</button>
          </div>
        )}

        {step === 1 && (
          <form onSubmit={handleSendOtp} className="flex flex-col gap-5 mt-2">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-bold text-slate-800 mr-2">شماره تلفن همراه:</label>
              <input type="tel" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full bg-white/90 rounded-full px-5 py-2.5 outline-none focus:ring-2 focus:ring-[#72BFC6] text-left" placeholder="09..." required />
            </div>
            {error && <p className="text-red-500 text-xs font-bold text-center">{error}</p>}
            <button type="submit" disabled={loading} className="w-full rounded-full bg-[linear-gradient(90deg,#2993A3_0%,#75C1C7_100%)] py-3 text-sm font-bold text-white disabled:opacity-70">{loading ? 'در حال ارسال...' : 'ارسال کد تایید'}</button>
          </form>
        )}

        {step === 2 && (
          <OTPVerification
            phoneNumber={phone}
            onVerify={handleVerifyOtp}
            onResend={handleResendOtp}
            onBack={() => setStep(1)}
          />
        )}

        {step === 3 && (
          <form onSubmit={handleSignup} className="flex flex-col gap-5 mt-2">
            <div className="flex gap-3">
              <div className="flex flex-col gap-2 flex-1">
                <label className="text-sm font-bold text-slate-800 mr-2">نام:</label>
                <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} className="w-full bg-white/90 rounded-full px-5 py-2.5 outline-none focus:ring-2 focus:ring-[#72BFC6]" required />
              </div>
              <div className="flex flex-col gap-2 flex-1">
                <label className="text-sm font-bold text-slate-800 mr-2">نام خانوادگی:</label>
                <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} className="w-full bg-white/90 rounded-full px-5 py-2.5 outline-none focus:ring-2 focus:ring-[#72BFC6]" required />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-bold text-slate-800 mr-2">رمز عبور:</label>
              <div className="relative w-full">
                <input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} className="w-full bg-white/90 rounded-full pl-12 pr-5 py-2.5 outline-none focus:ring-2 focus:ring-[#72BFC6] tracking-widest" required />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">{showPassword ? <EyeOff size={20} /> : <Eye size={20} />}</button>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-bold text-slate-800 mr-2">تکرار رمز عبور:</label>
              <input type="password" value={passwordConfirm} onChange={(e) => setPasswordConfirm(e.target.value)} className="w-full bg-white/90 rounded-full px-5 py-2.5 outline-none focus:ring-2 focus:ring-[#72BFC6] tracking-widest" required />
            </div>
            {error && <p className="text-red-500 text-xs font-bold text-center">{error}</p>}
            <button type="submit" disabled={loading} className="w-full rounded-full bg-[linear-gradient(90deg,#2993A3_0%,#75C1C7_100%)] py-3 text-sm font-bold text-white disabled:opacity-70">{loading ? 'در حال ثبت...' : 'تکمیل ثبت نام'}</button>
          </form>
        )}

        <div className="w-full h-px bg-white/80 my-2"></div>
        <div className="flex flex-col items-start gap-4">
          <span className="text-xs md:text-sm font-bold text-slate-800">قبلاً حساب کاربری ساخته‌اید؟</span>
          <button type="button" onClick={() => router.push('/login')} className="w-full border-2 border-[#009BB2] text-[#009BB2] font-bold text-sm rounded-[28px] px-6 py-2 hover:bg-[#009BB2] hover:text-white">ورود به حساب کاربری</button>
        </div>
      </div>
    </div>
  );
}