'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';
import Image from 'next/image';
import { toast } from 'sonner';
import api from '@/lib/api';
import { OTPVerification } from '@/components/ui/otp-input';

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState(1); // 1: Phone, 2: OTP, 3: New Password
  const [phone, setPhone] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [challengeId, setChallengeId] = useState('');
  const [otpToken, setOtpToken] = useState('');

  const formatPhone = (p: string) => p.startsWith("09") ? "+98" + p.substring(1) : p;

  const sendOtp = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError(null);
    try {
      const response = await api.post('/auth/request-otp/', {
        phone_number: formatPhone(phone),
        purpose: 'PASSWORD_RESET',
      });
      setChallengeId(response.data.challenge_id);
      toast.success("کد بازیابی ارسال شد.");
      setStep(2);
    } catch (err: any) { setError(err.response?.data?.detail || "خطا"); } 
    finally { setLoading(false); }
  };

  const verifyOtp = async (code: string) => {
    try {
      const response = await api.post('/auth/verify-otp/', {
        phone_number: formatPhone(phone),
        purpose: 'PASSWORD_RESET',
        challenge_id: challengeId,
        code,
      });
      setOtpToken(response.data.otp_token);
      setTimeout(() => setStep(3), 1500); // مکث برای نمایش انیمیشن
      return true;
    } catch (err: any) { return false; }
  };

  const resendOtp = async () => {
    try {
      const response = await api.post('/auth/request-otp/', {
        phone_number: formatPhone(phone),
        purpose: 'PASSWORD_RESET',
      });
      setChallengeId(response.data.challenge_id);
      toast.success("کد جدید ارسال شد.");
    } catch (err: any) { toast.error("خطا در ارسال مجدد کد."); }
  };

  const resetPassword = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError(null);
    try {
      await api.post('/auth/reset-password/', {
        phone_number: formatPhone(phone),
        otp_token: otpToken,
        new_password: newPassword,
      });
      toast.success("رمز عبور تغییر کرد. وارد شوید.");
      router.push('/login');
    } catch (err: any) { setError(err.response?.data?.detail || "خطا"); } 
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-slate-300 bg-cover bg-center" style={{ backgroundImage: "url('/images/login_bg.png')" }}>
      <div dir="rtl" className="w-full max-w-[420px] rounded-[40px] p-8 flex flex-col gap-6 my-8 relative" style={{ backgroundColor: 'rgba(242, 242, 242, 0.60)', backdropFilter: 'blur(16px)' }}>
        <div className="flex items-center justify-center gap-3">
          <h1 className="text-md md:text-xl font-bold text-slate-800">بازیابی رمز عبور</h1>
          <Image src={"/images/logo.png"} width={40} height={40} alt="" />
        </div>

        {step === 1 && (
          <form onSubmit={sendOtp} className="flex flex-col gap-5 mt-2">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-bold text-slate-800 mr-2">شماره تلفن همراه:</label>
              <input type="tel" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full bg-white/90 rounded-full px-5 py-2.5 outline-none focus:ring-2 focus:ring-[#72BFC6] text-left" placeholder="09..." required />
            </div>
            {error && <p className="text-red-500 text-xs font-bold text-center">{error}</p>}
            <button type="submit" disabled={loading} className="w-full rounded-full bg-[linear-gradient(90deg,#2993A3_0%,#75C1C7_100%)] py-3 text-sm font-bold text-white disabled:opacity-70">{loading ? 'در حال ارسال...' : 'ارسال کد بازیابی'}</button>
          </form>
        )}

        {step === 2 && (
          <OTPVerification 
            phoneNumber={phone} 
            onVerify={verifyOtp} 
            onResend={resendOtp} 
            onBack={() => setStep(1)} 
          />
        )}

        {step === 3 && (
          <form onSubmit={resetPassword} className="flex flex-col gap-5 mt-2">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-bold text-slate-800 mr-2">رمز عبور جدید:</label>
              <div className="relative w-full">
                <input type={showPass ? "text" : "password"} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full bg-white/90 rounded-full pl-12 pr-5 py-2.5 outline-none focus:ring-2 focus:ring-[#72BFC6] tracking-widest" required />
                <button type="button" onClick={() => setShowPass(!showPass)} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">{showPass ? <EyeOff size={20} /> : <Eye size={20} />}</button>
              </div>
            </div>
            {error && <p className="text-red-500 text-xs font-bold text-center">{error}</p>}
            <button type="submit" disabled={loading} className="w-full rounded-full bg-[linear-gradient(90deg,#2993A3_0%,#75C1C7_100%)] py-3 text-sm font-bold text-white disabled:opacity-70">{loading ? 'در حال ثبت...' : 'تغییر رمز عبور'}</button>
          </form>
        )}
      </div>
    </div>
  );
}
