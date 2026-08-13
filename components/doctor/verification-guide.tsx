// components/doctor/verification-guide.tsx
'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

const GUIDE_PREVIEW_TEXT = `همکار گرامی، به پلتفرم دیجیتال ما خوش آمدید. هدف از راه‌اندازی این پلتفرم، تسهیل ارتباط شما با بیماران و مدیریت بهینه فرآیندهای درمانی است. یکی از مراحل اولیه و حیاتی برای استفاده کامل از امکانات این سامانه، تکمیل و ارسال مدارک برای احراز هویت است.`;

const GUIDE_FULL_REST = `چرا احراز هویت در سایت ما الزامی است؟
۱. حفظ امنیت و اعتبار: اطمینان از اینکه حساب کاربری متعلق به شخص واقعی و دارای صلاحیت پزشکی است.
۲. رعایت الزامات قانونی: پایبندی به قوانین وزارت بهداشت و کانون پزشکان در خصوص ارائه خدمات دیجیتال سلامت.
۳. جلوگیری از سوءاستفاده: محافظت از شما و بیماران در برابر افراد سودجو.
لطفا با دقت فرم زیر را تکمیل کرده و تصویر واضح از کارت نظام پزشکی خود بارگذاری نمایید. پس از تایید توسط کارشناسان ما، دسترسی شما به تمامی بخش‌های پنل فعال خواهد شد.`;

export function VerificationGuide() {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 text-sm text-gray-600 shadow-sm">
      <p className="font-bold text-gray-800">{GUIDE_PREVIEW_TEXT}</p>
      
      {isExpanded && (
        <p className="mt-4 whitespace-pre-line">{GUIDE_FULL_REST}</p>
      )}

      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="mt-3 flex items-center justify-center w-full gap-1 text-[#009BB2] font-medium hover:underline"
      >
        <span>{isExpanded ? 'بستن متن راهنما' : 'مشاهده کامل متن راهنما'}</span>
        <ChevronDown
          className={cn('h-4 w-4 transition-transform', isExpanded && 'rotate-180')}
        />
      </button>
    </div>
  );
}