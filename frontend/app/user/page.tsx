"use client";

import { CalendarPlus, ClipboardList, MessageSquare, UserCog, CheckCircle, Hourglass, XCircle, ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function UserDashboardGuide() {
  return (
    <div className="w-full min-h-full flex flex-col space-y-8 bg-white rounded-2xl p-4 md:p-8 border border-gray-100 shadow-sm mt-16 md:mt-0">
      
      {/* هدر خوش‌آمدگویی */}
      <div className="flex flex-col gap-2 border-b border-gray-100 pb-6">
        <h1 className="text-xl md:text-2xl font-bold text-gray-800">
          به پنل کاربری دنتو تایم خوش آمدید 👋
        </h1>
        <p className="text-sm md:text-base text-gray-500 leading-relaxed">
          در این بخش می‌توانید نوبت‌های خود را مدیریت کنید، با پشتیبانی در ارتباط باشید و اطلاعات حساب کاربری خود را به‌روزرسانی نمایید. برای استفاده بهتر از امکانات، راهنمای زیر را مطالعه فرمایید.
        </p>
      </div>

      {/* گرید کارت‌های راهنما */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* راهنمای ثبت نوبت */}
        <div className="flex flex-col gap-4 bg-[#F5FAFF] rounded-2xl p-6 border border-[#5FB4FF]/20">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-white text-[#2993A3] shadow-sm">
              <CalendarPlus className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-bold text-slate-800">چگونه نوبت رزرو کنیم؟</h2>
          </div>
          <ul className="list-disc list-inside space-y-2 text-sm text-slate-600 marker:text-[#2993A3]">
            <li>به صفحه <span className="font-bold text-[#2993A3]">«نوبت‌ها»</span> در منوی کناری بروید.</li>
            <li>روی دکمه <span className="font-bold">«ثبت نوبت جدید»</span> کلیک کنید.</li>
            <li>در تقویم باز شده، روزهای کاری (غیر تعطیل) که ظرفیت دارند را انتخاب کنید.</li>
            <li>ساعت مراجعه را از لیست انتخاب کرده و دکمه ثبت نوبت را بزنید.</li>
            <li>پس از تایید نوبت توسط ادمین، پیامکی برای شما ارسال خواهد شد.</li>
          </ul>
          <Link href="/user/appointments" className="mt-2 flex items-center gap-1 text-sm font-bold text-[#2993A3] hover:gap-2 transition-all w-fit">
            رفتن به صفحه نوبت‌ها
            <ArrowLeft className="w-4 h-4" />
          </Link>
        </div>

        {/* راهنمای پیگیری و وضعیت‌ها */}
        <div className="flex flex-col gap-4 bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-[#F5FAFF] text-[#2993A3] shadow-sm">
              <ClipboardList className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-bold text-slate-800">وضعیت نوبت‌های من چه معنایی دارد؟</h2>
          </div>
          <div className="space-y-3 text-sm text-slate-600">
            <div className="flex items-center gap-2">
              <Hourglass className="w-4 h-4 text-yellow-500" />
              <span className="font-bold text-yellow-600">در انتظار تایید:</span> نوبت ثبت شده و منتظر تایید کلینیک است.
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500" />
              <span className="font-bold text-green-600">تایید شده:</span> کلینیک نوبت شما را تایید کرده است. در روز و ساعت مقرر مراجعه کنید.
            </div>
            <div className="flex items-center gap-2">
              <XCircle className="w-4 h-4 text-red-500" />
              <span className="font-bold text-red-600">رد شده / لغو شده:</span> نوبت توسط کلینیک رد شده یا توسط شما لغو شده است.
              <br />
              <span className="text-xs text-gray-400">(نوبت‌ها نهایتاً تا ۲۴ ساعت قبل قابل لغو هستند)</span>
            </div>
          </div>
        </div>

        {/* راهنمای چت و پشتیبانی */}
        <div className="flex flex-col gap-4 bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-[#F5FAFF] text-[#2993A3] shadow-sm">
              <MessageSquare className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-bold text-slate-800">ارتباط با پشتیبانی</h2>
          </div>
          <ul className="list-disc list-inside space-y-2 text-sm text-slate-600 marker:text-[#2993A3]">
            <li>برای طرح سوالات خود، وارد بخش <span className="font-bold text-[#2993A3]">«گفت و گو ها»</span> شوید.</li>
            <li>روی <span className="font-bold">«گفتگوی جدید»</span> کلیک کنید تا چت با پشتیبانی باز شود.</li>
            <li>می‌توانید عکس یا فایل‌های مربوط به پرونده دندانپزشکی خود (مثل فایل‌های سه‌بعدی) را ارسال کنید.</li>
            <li>پاسخ پشتیبانی در همان صفحه نمایش داده خواهد شد.</li>
          </ul>
          <Link href="/user/chat" className="mt-2 flex items-center gap-1 text-sm font-bold text-[#2993A3] hover:gap-2 transition-all w-fit">
            رفتن به گفتگوها
            <ArrowLeft className="w-4 h-4" />
          </Link>
        </div>

        {/* راهنمای ویرایش پروفایل */}
        <div className="flex flex-col gap-4 bg-[#F5FAFF] rounded-2xl p-6 border border-[#5FB4FF]/20">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-white text-[#2993A3] shadow-sm">
              <UserCog className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-bold text-slate-800">مدیریت حساب کاربری</h2>
          </div>
          <ul className="list-disc list-inside space-y-2 text-sm text-slate-600 marker:text-[#2993A3]">
            <li>از طریق دکمه <span className="font-bold text-[#2993A3]">«ویرایش اطلاعات»</span> در منوی کناری، می‌توانید پروفایل خود را باز کنید.</li>
            <li>عکس پروفایل خود را تغییر دهید (حداکثر ۲ مگابایت).</li>
            <li>نام، نام خانوادگی و نام کاربری خود را در صورت نیاز اصلاح کنید.</li>
            <li>رمز عبور خود را به صورت دوره‌ای تغییر دهید تا امنیت حساب خود حفظ شود.</li>
          </ul>
        </div>

      </div>
    </div>
  );
}