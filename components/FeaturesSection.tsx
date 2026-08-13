import React from 'react';
import { Clock, Settings, ShieldCheck } from 'lucide-react';
import Image from 'next/image';

export default function FeaturesSection() {
  return (
    <section 
      dir="rtl" 
      className="w-full py-16 md:py-24 px-8 sm:px-6 lg:px-28 max-w-300 mx-auto mt-4 md:mt-12 overflow-x-hidden md:overflow-x-visible"
    >
      {/* ================= Row 1 ================= */}
      <div className="flex flex-col lg:flex-row gap-10 lg:gap-16 items-center">
        {/* Text Section (Right Visually) */}
        <div className="w-full lg:w-1/2 flex flex-col gap-6">
          <h2 className="text-center md:text-right text-[26px] md:text-4xl lg:text-[40px] font-extrabold text-slate-900">
            چه چیزی ما را متفاوت کرده؟
          </h2>
          <p className="text-slate-600 text-base md:text-lg leading-relaxed text-justify">
            تعهد ما به پیشبرد استانداردهای دندان‌پزشکی دیجیتال، در هم‌آمیزی تخصص و تکنولوژی خلاصه می‌شود. ما با بهینه‌سازی دقیق‌ترین فرآیندهای ساخت و اتکا بر دانش روز، پاسخگویی به نیازهای پیچیده مراجعین و پزشکان را با بالاترین کیفیت تضمین می‌کنیم.
          </p>
          
          {/* Certificate Placeholder Circles */}
          <div className="flex justify-between items-center gap-4 md:gap-6 mt-2">
            {[1, 2, 3].map((item) => (
              <div 
                key={item} 
                className="w-20 h-20 md:w-32 md:h-32 rounded-full bg-slate-200/80 shadow-sm border border-slate-100 flex items-center justify-center text-xs text-slate-400"
              >
                گواهینامه
              </div>
            ))}
          </div>
        </div>

        {/* Image Section (Left Visually) */}
        <div className="w-full lg:w-1/2">
          {/* Placeholder for the main image */}
          <div className="w-full aspect-4/3 bg-slate-200 rounded-[36px] overflow-hidden relative shadow-md">
             <div className="absolute inset-0 flex items-center justify-center text-slate-500 font-medium">
               <Image src={"/images/features_image_2.png"} fill alt='' />
             </div>
          </div>
        </div>
      </div>

      {/* ================= Row 2 ================= */}
      <div className="flex flex-col lg:flex-row gap-16 lg:gap-8 mt-12 md:mt-32 items-center">
        
        {/* Right Section (Big Card visually in RTL) */}
        {/* Added ml-4 lg:ml-20 to make room for the absolute red box on the left */}
        <div className="w-full lg:w-[55%] relative ml-0 lg:ml-16">
          <div className="bg-[linear-gradient(135deg,#E8F4F7_0%,#D0EBEF_100%)] rounded-[58px] p-8 md:p-12 lg:p-16 w-full aspect-4/3 flex flex-col justify-center relative overflow-visible shadow-sm">
            {/* Background Image Placeholder inside the card */}
            <Image className="absolute inset-0 rounded-[58px] z-0" src={"/images/features_image_3.png"} fill alt='' />
            
            <div className="relative z-10 text-right pr-2">
              <h3 className="text-2xl md:text-3xl font-extrabold text-slate-900 mb-4">
                تکنسین‌های مجرب و دارای گواهینامه
              </h3>
              <p className="text-slate-700 text-base md:text-lg leading-relaxed text-right max-w-[95%] md:max-w-[90%]">
                ساخت ظریف‌ترین پروتزها و ارستوریشن‌های دندانی در لابراتوار ما، توسط متخصصین و تکنسین‌های برتری انجام می‌شود که دوره‌های پیشرفته بین‌المللی را در حوزه ساخت دیجیتال گذرانده‌اند.
              </p>
            </div>

            {/* Red Rectangle (Certificate Image Placeholder) Pushed to the left */}
            {/* Positioned logically on the left edge of the container */}
            <div className="absolute top-auto hidden lg:flex -bottom-10 md:top-1/2 md:-translate-y-1/2 -left-4 md:-left-20 w-30 h-37.5 md:w-40 md:h-50 bg-red-500 rounded-3xl z-20 shadow-[0_10px_30px_rgba(239,68,68,0.3)] border-4 border-white items-center justify-center text-white text-sm font-bold">
              عکس گواهینامه
            </div>
          </div>
        </div>

        {/* Left Section (Two items visually in RTL) */}
        <div className="w-full lg:w-[45%] flex flex-col gap-10 md:gap-14 mt-4 lg:mt-0 px-2">
          
          {/* Up Item */}
          <div className="flex flex-col gap-4 text-right">
            <div className="w-14.5 h-14.5 rounded-[24px] bg-[#E1F2F4] text-[#369381] flex items-center justify-center shadow-sm">
              <Clock className="w-8 h-8" strokeWidth={2} />
            </div>
            <h4 className="text-xl md:text-2xl font-bold text-slate-900">
              تحویل سریع و به موقع
            </h4>
            <p className="text-slate-600 text-base leading-relaxed text-justify">
              جریان کاری کاملاً دیجیتال و پیوسته ما، زمان انتظار برای ساخت و آماده‌سازی سفارش‌ها را به حداقل رسانده و تحویل سریع را بدون افت کیفیت میسر می‌سازد.
            </p>
          </div>

          {/* Down Item */}
          <div className="flex flex-col gap-4 text-right">
            <div className="w-14.5 h-14.5 rounded-[24px] bg-[#E1F2F4] text-[#369381] flex items-center justify-center shadow-sm">
              <Settings className="w-8 h-8" strokeWidth={2} />
            </div>
            <h4 className="text-xl md:text-2xl font-bold text-slate-900">
              متریال درجه‌یک و مرغوب
            </h4>
            <p className="text-slate-600 text-base leading-relaxed text-justify">
              در تمامی مراحل ساخت، منحصراً از مواد اولیه زیست‌سازگار، بلوک‌های سرامیکی باکیفیت و آلیاژهای استاندارد جهانی استفاده می‌شود تا دوام و زیبایی طبیعی پروتزها تضمین شود.
            </p>
          </div>

        </div>
      </div>

      {/* ================= Row 3 ================= */}
      <div className="flex flex-col lg:flex-row gap-10 lg:gap-16 items-center mt-12 md:mt-32">
        {/* Image Section (Right Visually) */}
        <div className="w-full lg:w-1/2">
          <div className="w-full aspect-4/3 bg-slate-200 rounded-[36px] overflow-hidden relative shadow-md">
             <div className="absolute inset-0 flex items-center justify-center text-slate-500 font-medium">
                <Image src={"/images/features_image_1.png"} fill alt='' />
             </div>
          </div>
        </div>

        {/* Text Section (Left Visually) */}
        <div className="w-full lg:w-1/2 flex flex-col gap-4 text-right">
          <div className="mb-2">
            <ShieldCheck className="w-12 h-12 text-[#369381]" strokeWidth={2} />
          </div>
          <h2 className="text-2xl md:text-3xl lg:text-4xl font-extrabold text-slate-900">
            تضمین کیفیت عملکرد
          </h2>
          <p className="text-slate-600 text-base md:text-lg leading-relaxed text-justify mt-2">
            تمامی قطعات و پروتزهای خارج‌شده از خط تولید لابراتوار، تحت نظارت میکروسکوپی و کنترل کیفی چندمرحله‌ای قرار می‌گیرند. ما با اطمینان از انطباق دقیق، پایداری ساختار و آناتومی بی‌نقص خروجی‌ها، کیفیت نهایی کار خود را به طور کامل تضمین می‌کنیم.
          </p>
        </div>
      </div>

    </section>
  );
}