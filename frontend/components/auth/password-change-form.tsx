"use client";

import { useState } from "react";
import axios from "axios";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";

import { OTPVerification } from "@/components/ui/otp-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import api from "@/lib/api";
import { clearTokens } from "@/lib/auth";
import { toast } from "sonner";

type PasswordChangeStep = "request" | "verify" | "password";

type PasswordChangeFormProps = {
  className?: string;
};

type ErrorResponse = {
  detail?: unknown;
  new_password?: unknown;
  non_field_errors?: unknown;
};

function formatPhone(phone: string): string {
  return phone.startsWith("+989") ? `09${phone.slice(4)}` : phone;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (!axios.isAxiosError<ErrorResponse>(error)) return fallback;
  const response = error.response?.data;
  const detail = response?.detail ?? response?.new_password ?? response?.non_field_errors;
  if (Array.isArray(detail)) return detail.join(" ");
  return typeof detail === "string" ? detail : fallback;
}

export function PasswordChangeForm({ className = "" }: PasswordChangeFormProps) {
  const router = useRouter();
  const [step, setStep] = useState<PasswordChangeStep>("request");
  const [challengeId, setChallengeId] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [otpToken, setOtpToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestOtp = async () => {
    setIsBusy(true);
    setError(null);
    try {
      const response = await api.post("/users/me/change-password/request-otp/");
      const nextChallengeId = response.data?.challenge_id;
      const nextPhoneNumber = response.data?.phone_number;
      if (!nextChallengeId || !nextPhoneNumber) {
        throw new Error("کد تایید دریافت نشد. لطفاً دوباره تلاش کنید.");
      }
      setChallengeId(String(nextChallengeId));
      setPhoneNumber(String(nextPhoneNumber));
      setStep("verify");
      toast.success("کد تایید به شماره موبایل شما ارسال شد.");
    } catch (requestError: unknown) {
      setError(getErrorMessage(requestError, "خطا در ارسال کد تایید."));
    } finally {
      setIsBusy(false);
    }
  };

  const verifyOtp = async (code: string): Promise<boolean> => {
    try {
      const response = await api.post("/auth/verify-otp/", {
        phone_number: phoneNumber,
        purpose: "PASSWORD_CHANGE",
        challenge_id: challengeId,
        code,
      });
      setOtpToken(response.data.otp_token);
      setError(null);
      setStep("password");
      return true;
    } catch (verifyError: unknown) {
      setError(getErrorMessage(verifyError, "کد تایید اشتباه یا منقضی شده است."));
      return false;
    }
  };

  const resendOtp = async () => {
    try {
      const response = await api.post("/users/me/change-password/request-otp/");
      setChallengeId(String(response.data.challenge_id));
      setPhoneNumber(String(response.data.phone_number || phoneNumber));
      setError(null);
      toast.success("کد تایید جدید ارسال شد.");
    } catch (resendError: unknown) {
      setError(getErrorMessage(resendError, "خطا در ارسال مجدد کد تایید."));
    }
  };

  const submitPassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      setError("رمز عبور جدید و تکرار آن یکسان نیستند.");
      return;
    }
    setIsBusy(true);
    setError(null);
    try {
      await api.post("/users/me/change-password/", {
        otp_token: otpToken,
        new_password: newPassword,
      });
      clearTokens();
      toast.success("رمز عبور با موفقیت تغییر کرد. لطفاً دوباره وارد شوید.");
      router.replace("/login");
    } catch (submitError: unknown) {
      setError(getErrorMessage(submitError, "خطا در تغییر رمز عبور."));
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <section className={`bg-white rounded-2xl px-4 md:px-8 pb-8 ${className}`} dir="rtl">
      <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
        <Lock className="text-[#2993A3]" />
        تغییر رمز عبور
      </h2>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg">{error}</div>}

      {step === "request" && (
        <div className="space-y-5">
          <p className="text-sm leading-7 text-gray-600">
            برای امنیت حساب، یک کد تایید پنج رقمی به شماره موبایل ثبت‌شده شما ارسال می‌شود.
          </p>
          <Button type="button" disabled={isBusy} onClick={requestOtp} className="bg-[#2993A3] hover:bg-[#1f7b89]">
            {isBusy ? "در حال ارسال..." : "ارسال کد تایید"}
          </Button>
        </div>
      )}

      {step === "verify" && (
        <div className="space-y-4">
          <p className="text-sm leading-7 text-gray-600">
            کد ارسال‌شده به <span dir="ltr" className="font-bold">{formatPhone(phoneNumber)}</span> را وارد کنید.
          </p>
          <OTPVerification
            phoneNumber={formatPhone(phoneNumber)}
            onVerify={verifyOtp}
            onResend={resendOtp}
            onBack={() => setStep("request")}
          />
        </div>
      )}

      {step === "password" && (
        <form onSubmit={submitPassword} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="new-password-otp">رمز عبور جدید</Label>
            <Input
              id="new-password-otp"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              required
              className="border-gray-200 focus:border-[#5FB4FF]"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password-otp">تکرار رمز عبور جدید</Label>
            <Input
              id="confirm-password-otp"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
              className="border-gray-200 focus:border-[#5FB4FF]"
            />
          </div>
          <Button type="submit" disabled={isBusy} className="bg-[#2993A3] hover:bg-[#1f7b89]">
            {isBusy ? "در حال ثبت..." : "ثبت رمز عبور جدید"}
          </Button>
        </form>
      )}
    </section>
  );
}

