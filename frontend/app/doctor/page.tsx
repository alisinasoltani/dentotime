// app/doctor/page.tsx
'use client';

import Link from 'next/link';
import { 
  ShieldCheck, 
  MessageSquare, 
  UserCog, 
  UploadCloud, 
  Clock, 
  FileCheck, 
  Headset,
  ArrowLeft
} from 'lucide-react';

export default function DoctorDashboardHome() {
  return (
    <div className="mx-auto max-w-5xl p-4 md:p-8 space-y-8">
      
      {/* هدر خوش آمدگویی */}
      <div className="rounded-2xl bg-gradient-to-l from-[#2993A3] to-[#75C1C7] p-6 md:p-8 text-white shadow-md">
        <h1 className="text-2xl md:text-3xl font-bold mb-2">به پنل پزشکان دنتوتایم خوش آمدید</h1>
        <p className="text-white/90 text-sm md:text-base leading-relaxed">
          این پنل برای تسهیل ارتباط شما با تیم پشتیبانی و مدیریت هویت حرفه‌ای شما طراحی شده است. در ادامه، راهنمای استفاده از امکانات این پنل را برای شما آماده کرده‌ایم.
        </p>
      </div>

      {/* بخش ۱: احراز هویت */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 md:p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-[#E9F5F9] rounded-xl">
            <ShieldCheck className="h-6 w-6 text-[#2993A3]" />
          </div>
          <h2 className="text-xl font-bold text-gray-800">راهنمای احراز هویت</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* چرا احراز هویت؟ */}
          <div className="space-y-2">
            <h3 className="font-semibold text-gray-700 flex items-center gap-2">
              <FileCheck className="h-4 w-4 text-[#5FB4FF]" />
              چرا احراز هویت مهم است؟
            </h3>
            <p className="text-sm text-gray-600 leading-6">
              احراز هویت تضمین می‌کند که حساب کاربری شما متعلق به یک پزشک معتبر است. این فرآیند برای حفظ امنیت سامانه و رعایت الزامات قانونی وزارت بهداشت ضروری است. تا زمان تایید هویت شما، دسترسی به بخش گفتگوها غیرفعال خواهد بود.
            </p>
          </div>

          {/* نکات آپلود مدارک */}
          <div className="space-y-2">
            <h3 className="font-semibold text-gray-700 flex items-center gap-2">
              <UploadCloud className="h-4 w-4 text-[#5FB4FF]" />
              نکات بارگذاری مدارک
            </h3>
            <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside leading-6">
              <li>تصویر واضح از کارت نظام پزشکی خود بارگذاری کنید.</li>
              <li>امکان بارگذاری حداکثر ۵ فایل به صورت همزمان وجود دارد.</li>
              <li>فرمت فایل‌ها باید PNG یا JPEG باشد.</li>
              <li>حداکثر حجم مجاز برای هر فایل ۱۰ مگابایت است.</li>
            </ul>
          </div>

          {/* وضعیت‌های احراز هویت */}
          <div className="space-y-2 md:col-span-2">
            <h3 className="font-semibold text-gray-700 flex items-center gap-2">
              <Clock className="h-4 w-4 text-[#5FB4FF]" />
              وضعیت‌های درخواست
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-2">
              <div className="p-4 rounded-xl bg-[#E9F5F9] border border-[#5FB4FF]/50">
                <p className="text-sm font-bold text-[#2993A3] mb-1">در حال بررسی</p>
                <p className="text-xs text-gray-600">پس از ارسال، درخواست شما حداکثر تا ۲ روز کاری توسط کارشناسان بررسی می‌شود.</p>
              </div>
              <div className="p-4 rounded-xl bg-red-50 border border-red-200">
                <p className="text-sm font-bold text-red-500 mb-1">رد شده</p>
                <p className="text-xs text-gray-600">در صورت نقص مدارک، دلیل رد شدن نمایش داده می‌شود تا نسبت به اصلاح و ارسال مجدد اقدام کنید.</p>
              </div>
              <div className="p-4 rounded-xl bg-green-50 border border-green-200">
                <p className="text-sm font-bold text-green-600 mb-1">تایید شده</p>
                <p className="text-xs text-gray-600">پس از تایید، دسترسی شما به بخش گفتگوها و سایر امکانات پنل فعال خواهد شد.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-start">
          <Link href="/doctor/verification" className="inline-flex items-center gap-2 text-sm font-medium text-[#2993A3] hover:underline">
            رفتن به صفحه احراز هویت
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {/* بخش ۲: گفت و گوها */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 md:p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-[#E9F5F9] rounded-xl">
            <MessageSquare className="h-6 w-6 text-[#2993A3]" />
          </div>
          <h2 className="text-xl font-bold text-gray-800">راهنمای گفت و گوها</h2>
        </div>

        <div className="space-y-6">
          {/* شروع گفتگو */}
          <div className="space-y-2">
            <h3 className="font-semibold text-gray-700 flex items-center gap-2">
              <Headset className="h-4 w-4 text-[#5FB4FF]" />
              ارتباط با پشتیبانی
            </h3>
            <p className="text-sm text-gray-600 leading-6">
              در این بخش شما می‌توانید مستقیماً با تیم پشتیبانی دنتوتایم ارتباط برقرار کنید. با کلیک روی دکمه «گفتگوی جدید»، یک مکالمه با پشتیبانی آغاز می‌شود. پیام‌های شما در سمت راست (به رنگ آبی روشن) و پاسخ‌های پشتیبانی در سمت چپ نمایش داده می‌شوند.
            </p>
          </div>

          {/* ارسال فایل و اسکن سه‌بعدی */}
          <div className="p-4 rounded-xl bg-gray-50 border border-gray-100">
            <h3 className="font-semibold text-gray-700 mb-2 flex items-center gap-2">
              <UploadCloud className="h-4 w-4 text-[#5FB4FF]" />
              ارسال فایل و اسکن‌های سه‌بعدی
            </h3>
            <p className="text-sm text-gray-600 leading-6 mb-3">
              شما می‌توانید در چت، عکس، PDF و فایل‌های اسکن سه‌بعدی را برای پشتیبانی ارسال کنید.
            </p>
            <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside leading-6">
              <li>فرمت‌های مجاز: تصاویر (JPEG, PNG, WEBP)، PDF و فایل‌های سه‌بعدی (STL, PLY, OBJ).</li>
              <li>حداکثر حجم فایل: ۱ گیگابایت (به دلیل حجم بالای فایل‌های اسکن).</li>
              <li>هنگام آپلود فایل‌های سنگین، نوار پیشرفت آپلود نمایش داده می‌شود و در صورت نیاز می‌توانید آن را لغو کنید.</li>
            </ul>
          </div>
        </div>

        <div className="mt-6 flex justify-start">
          <Link href="/doctor/chat" className="inline-flex items-center gap-2 text-sm font-medium text-[#2993A3] hover:underline">
            رفتن به گفت و گوها
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {/* بخش ۳: تغییرات حساب */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 md:p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-[#E9F5F9] rounded-xl">
            <UserCog className="h-6 w-6 text-[#2993A3]" />
          </div>
          <h2 className="text-xl font-bold text-gray-800">مدیریت حساب کاربری</h2>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <h3 className="font-semibold text-gray-700">ویرایش اطلاعات</h3>
            <p className="text-sm text-gray-600 leading-6">
              می‌توانید نام، نام خانوادگی و نام کاربری خود را به‌روزرسانی کنید. تغییرات بلافاصله در سایدبار پنل شما اعمال خواهد شد.
            </p>
          </div>
          <div className="space-y-2">
            <h3 className="font-semibold text-gray-700">تغییر عکس پروفایل</h3>
            <p className="text-sm text-gray-600 leading-6">
              عکس پروفایل خود را تغییر دهید. برای دقت بیشتر، ابزار برش تصویر (Crop) در دسترس شما قرار دارد تا عکس را به صورت مربعی تنظیم کنید.
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-start">
          <Link href="/doctor/edit-info" className="inline-flex items-center gap-2 text-sm font-medium text-[#2993A3] hover:underline">
            رفتن به ویرایش اطلاعات
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </div>
      </div>

    </div>
  );
}