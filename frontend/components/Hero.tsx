"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";

import { BookingButton } from "@/components/booking/BookingExperience";

export default function Hero() {
  return (
    <section className="mx-3 mt-3 overflow-hidden rounded-[24px] border border-[#D8EFF2] bg-[#F3FBFC] sm:mx-4 lg:mx-6" dir="rtl">
      <div className="mx-auto grid min-h-[520px] max-w-[1400px] items-stretch lg:grid-cols-[0.92fr_1.08fr]">
        <div className="order-2 flex items-center px-5 py-12 sm:px-10 lg:order-1 lg:px-14 lg:py-16 xl:px-20">
          <div className="max-w-[590px]">
            <h1 className="text-[34px] font-black leading-[1.5] tracking-[-0.02em] text-[#111] sm:text-[44px] lg:text-[50px] lg:leading-[1.35]">
              لبخند سالم، با انتخابی مطمئن شروع می‌شود
            </h1>
            <p className="mt-5 max-w-[560px] text-[15px] leading-8 text-[#555] sm:text-[17px]">
              دنتوتایم مسیر انتخاب دندان‌پزشک، بررسی پوشش بیمه و رزرو نوبت را شفاف می‌کند؛ تا درمان را با اطلاعات کافی و آرامش بیشتری آغاز کنید.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <BookingButton className="h-12 bg-[linear-gradient(90deg,#2993A3_0%,#75C1C7_100%)] px-7 text-base font-bold text-white shadow-[0_12px_30px_rgba(41,147,163,0.24)] hover:brightness-95">
                رزرو نوبت آنلاین
              </BookingButton>
              <Link
                href="#services"
                className="inline-flex min-h-12 items-center justify-center gap-2 border-1 border-[#2993A3] rounded-sm px-5 text-sm font-bold text-[#2993A3] transition hover:bg-white"
              >
                مشاهده خدمات
                <ArrowLeft className="size-4" aria-hidden="true" />
              </Link>
            </div>
            <p className="mt-5 inline-flex items-center justify-center gap-2 text-sm text-[#66787B]">
              <ShieldCheck className="size-5 text-[#2993A3]" aria-hidden="true" />
              اطلاعات شما محرمانه است و نوبت بدون پرداخت پنهان ثبت می‌شود.
            </p>
          </div>
        </div>

        <div className="relative order-1 min-h-[300px] overflow-hidden lg:order-2 lg:min-h-[520px]">
          <Image
            src="/images/hero_image.png"
            alt="لابراتوار دیجیتال دندان‌پزشکی و ساخت پروتز"
            fill
            priority
            sizes="(min-width: 1024px) 55vw, 100vw"
            className="object-cover object-left"
          />
          <div className="absolute inset-y-0 right-0 hidden w-36 bg-gradient-to-l from-[#F3FBFC] to-transparent lg:block" aria-hidden="true" />
        </div>
      </div>
    </section>
  );
}
