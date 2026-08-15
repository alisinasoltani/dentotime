"use client";

import { Star } from "lucide-react";

import { RatingsPanel } from "@/components/ratings/ratings-panel";

export default function DoctorRatingsPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-8" dir="rtl">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-yellow-50 p-2 text-yellow-600"><Star className="h-6 w-6" fill="currentColor" /></div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">امتیازهای من</h1>
          <p className="text-sm text-gray-500">میانگین امتیاز و فهرست رأی‌دهندگان را مشاهده کنید.</p>
        </div>
      </div>
      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm md:p-7">
        <RatingsPanel endpoint="/doctors/ratings/" />
      </div>
    </div>
  );
}
