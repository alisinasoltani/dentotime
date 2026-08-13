"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import axios from "axios";

export default function AdminLoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    let formattedPhone = phone.trim();
    if (formattedPhone.startsWith("09")) {
      formattedPhone = "+98" + formattedPhone.substring(1);
    }

    try {
      const res = await api.post("/auth/login/", {
        phone_number: formattedPhone,
        password: password,
        user_type: "ADMIN",
      });

      localStorage.setItem("access_token", res.data.access);
      localStorage.setItem("refresh_token", res.data.refresh);
      localStorage.setItem("user", JSON.stringify(res.data.user));
      localStorage.setItem("user_role", res.data.user.role);

      router.push("/admin");
    } catch (err: any) {
      if (err.response?.status === 400) {
        const errorData = err.response.data;
        const errorMessage = Object.values(errorData).flat().join(" ") || "اطلاعات وارد شده نامعتبر است.";
        setError(errorMessage);
      } else if (err.response?.status === 401) {
        // نمایش پیام دقیق بک‌اند در صورت وجود، در غیر اینصورت پیام پیش‌فرض
        const errMsg = err.response?.data?.detail || "شماره موبایل یا رمز عبور اشتباه است. (یا فرمت شماره در دیتابیس متفاوت است)";
        setError(errMsg);
      } else {
        setError(err.response?.data?.detail || "خطایی در سرور رخ داده است.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#F5FAFF] to-[#EEF7FF] p-4">
      <div className="bg-white p-8 rounded-2xl shadow-sm w-full max-w-md border border-[#5FB4FF]/30">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-[#2993A3]">ورود ادمین دنتو تایم</h2>
          <p className="text-sm text-gray-500 mt-2">برای دسترسی به پنل مدیریت وارد حساب خود شوید</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="phone" className="text-gray-700">شماره موبایل</Label>
            <Input
              id="phone"
              type="tel"
              placeholder="09123456789"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              className="border-gray-200 focus:border-[#5FB4FF] focus:ring-[#5FB4FF]"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password" className="text-gray-700">رمز عبور</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="border-gray-200 focus:border-[#5FB4FF] focus:ring-[#5FB4FF]"
            />
          </div>

          <Button
            type="submit"
            className="w-full bg-[#2993A3] hover:bg-[#1f7b89] text-white py-2.5 rounded-xl transition-colors"
            disabled={loading}
          >
            {loading ? "در حال ورود..." : "ورود به پنل"}
          </Button>
        </form>
      </div>
    </div>
  );
}