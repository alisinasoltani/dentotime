import React from 'react';
import { ArrowLeft } from 'lucide-react';
import Image from 'next/image';
import digital_services_icon from "@/public/icons/digital_services.svg";
import fast_services_icon from "@/public/icons/fast_services.svg";
import implant_icon from "@/public/icons/implant.svg";
import movable_prosthesis_icon from "@/public/icons/movable_prosthesis.svg";

export default function Services() {
  return (
    <section id="services" className="w-full pt-8 pb-20 px-4 sm:px-6 lg:px-20 max-w-350 mx-auto">
      {/* Header Section */}
      <div className="text-center max-w-4xl mx-auto mb-8 md:mb-16">
        <h2 className="text-4xl md:text-5xl font-extrabold text-slate-900 mb-6 drop-shadow-sm">
          سرویس ها
        </h2>
        <p className="text-base md:text-lg text-slate-700 leading-relaxed font-medium">
          با بهره‌گیری از تجهیزات مدرن، فناوری‌های دیجیتال و تیمی متخصص، طیف کاملی از خدمات لابراتواری دندانپزشکی را با بالاترین استانداردهای کیفیت ارائه می‌دهیم. از طراحی و ساخت پروتزهای ثابت و متحرک تا راهکارهای پیشرفته ایمپلنت و ترمیم‌های زیبایی، هدف ما ارائه نتایجی دقیق، ماندگار و هماهنگ با نیاز هر بیمار است.
        </p>
      </div>

      {/* 12-Column Grid for Desktop (lg)
        2-Column Grid for Tablet (md)
        1-Column Grid for Mobile (default)
      */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-6 lg:gap-8 items-stretch mx-0 lg:mx-12">
        
        {/* ================= سطر اول ================= */}

        {/* 1. عکس خانم (راست) - 3 ستون در دسکتاپ */}
        <div className="md:col-span-1 lg:col-span-3 rounded-[32px] bg-slate-200 w-full aspect-square flex items-center justify-center overflow-hidden relative shadow-sm">
          <Image src={"/images/services_image_1.png"} fill alt='' />
        </div>

        {/* 2. کارت خدمات یک‌روزه (وسط) - 6 ستون در دسکتاپ (پهن‌تر) */}
        <div className="md:col-span-1 lg:col-span-6 group flex flex-col items-start justify-between text-right p-8 rounded-[32px] border border-slate-200 bg-white
        cursor-pointer transition-all duration-300 ease-out hover:bg-[linear-gradient(135deg,#F5FCFC_0%,#EEF9FB_31%,#E6F5FA_62%,#DFF0F7_100%)] hover:border-transparent
        hover:outline-2 hover:outline-[#9BCAD7] hover:shadow-[0_4px_36px_4px_rgba(164,210,223,0.69)]">
          <div className='flex flex-col gap-2 mb-2'>
            <div className="w-16 h-16flex items-center justify-center">
              <Image src={fast_services_icon} width={64} height={64} alt='' />
            </div>
            <h3 className="text-2xl font-bold text-slate-900">خدمات یک‌روزه</h3>
            <p className="text-slate-600 leading-relaxed text-sm md:text-base font-medium max-w-md">
              ارائه برخی خدمات و ترمیم‌های دندانی در کوتاه‌ترین زمان ممکن، بدون کاهش کیفیت.
            </p>
          </div>
          <div className="flex items-center gap-2 pt-2 md:pt-0 text-[#2993A3] font-bold text-sm md:text-base transition-transform group-hover:-translate-x-2">
            <span>جزئیات و اطلاعات تکمیلی</span>
            <ArrowLeft size={18} strokeWidth={2.5} />
          </div>
        </div>

        {/* 3. عکس دندان (چپ) - 3 ستون در دسکتاپ */}
        <div className="md:col-span-1 lg:col-span-3 rounded-[32px] w-full aspect-square bg-slate-200 flex items-center justify-center overflow-hidden relative shadow-sm">
          <Image src={"/images/services_image_2.png"} fill alt='' />
        </div>


        {/* ================= سطر دوم ================= */}

        {/* 4. دندانپزشکی دیجیتال (راست) - 4 ستون */}
        <div className="md:col-span-1 lg:col-span-4 group flex flex-col items-start justify-between text-right p-8 rounded-[32px] border border-slate-200 bg-white cursor-pointer transition-all duration-300 ease-out hover:bg-[linear-gradient(135deg,#F5FCFC_0%,#EEF9FB_31%,#E6F5FA_62%,#DFF0F7_100%)] hover:border-transparent 
        hover:outline-2 hover:outline-[#9BCAD7] hover:shadow-[0_4px_36px_4px_rgba(164,210,223,0.69)]">
          <div className='flex flex-col gap-2 mb-2'>
            <div className="w-16 h-16 mb-2 flex items-center justify-center">
              <Image src={digital_services_icon} width={64} height={64} alt='' />
            </div>
            <h3 className="text-2xl font-bold text-slate-900 mb-4">دندانپزشکی دیجیتال</h3>
            <p className="text-slate-600 leading-relaxed text-sm md:text-base font-medium">
              استفاده از اسکن و طراحی دیجیتال برای افزایش دقت، سرعت و کیفیت درمان‌های دندانپزشکی.
            </p>
          </div>
          <div className="mt-2 flex items-center gap-2 pt-2 md:pt-0 text-[#2993A3] font-bold text-sm md:text-base transition-transform group-hover:-translate-x-2">
            <span>جزئیات و اطلاعات تکمیلی</span>
            <ArrowLeft size={18} strokeWidth={2.5} />
          </div>
        </div>

        {/* 5. پروتز متحرک (وسط) - 4 ستون */}
        <div className="md:col-span-1 lg:col-span-4 group flex flex-col items-start justify-between text-right p-8 rounded-[32px] border border-slate-200 bg-white cursor-pointer transition-all duration-300 ease-out hover:bg-[linear-gradient(135deg,#F5FCFC_0%,#EEF9FB_31%,#E6F5FA_62%,#DFF0F7_100%)] hover:border-transparent
        hover:outline-2 hover:outline-[#9BCAD7] hover:shadow-[0_4px_36px_4px_rgba(164,210,223,0.69)]">
          <div className='flex flex-col gap-2 mb-2'>
            <div className="w-16 h-16 mb-2 flex items-center justify-center">
              <Image src={movable_prosthesis_icon} width={64} height={64} alt='' />
            </div>
            <h3 className="text-2xl font-bold text-slate-900 mb-4">پروتز متحرک</h3>
            <p className="text-slate-600 leading-relaxed text-sm md:text-base font-medium">
              ساخت پروتزهای متحرک سفارشی با راحتی بالا، ظاهر طبیعی و تطابق دقیق با فک بیمار.
            </p>
          </div>
          <div className="mt-2 flex items-center gap-2 pt-2 md:pt-0 text-[#2993A3] font-bold text-sm md:text-base transition-transform group-hover:-translate-x-2">
            <span>جزئیات و اطلاعات تکمیلی</span>
            <ArrowLeft size={18} strokeWidth={2.5} />
          </div>
        </div>

        {/* 6. ایمپلنت دندان (چپ) - 4 ستون */}
        <div className="md:col-span-1 lg:col-span-4 group flex flex-col items-start justify-between text-right p-8 rounded-[32px] border border-slate-200 bg-white cursor-pointer transition-all duration-300 ease-out hover:bg-[linear-gradient(135deg,#F5FCFC_0%,#EEF9FB_31%,#E6F5FA_62%,#DFF0F7_100%)] hover:border-transparent
        hover:outline-2 hover:outline-[#9BCAD7] hover:shadow-[0_4px_36px_4px_rgba(164,210,223,0.69)]">
          <div>
            <div className="w-16 h-16 mb-6 flex items-center justify-center">
              <Image src={implant_icon} height={64} alt='' />
            </div>
            <h3 className="text-2xl font-bold text-slate-900 mb-4">ایمپلنت دندان</h3>
            <p className="text-slate-600 leading-relaxed text-sm md:text-base font-medium">
              جایگزینی دائمی دندان‌های از دست‌رفته با ظاهری طبیعی، دوام بالا و عملکردی مشابه دندان واقعی.
            </p>
          </div>
          <div className="mt-2 flex items-center gap-2 pt-2 md:pt-0 text-[#2993A3] font-bold text-sm md:text-base transition-transform group-hover:-translate-x-2">
            <span>جزئیات و اطلاعات تکمیلی</span>
            <ArrowLeft size={18} strokeWidth={2.5} />
          </div>
        </div>

      </div>
    </section>
  );
}