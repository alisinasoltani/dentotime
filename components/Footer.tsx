'use client';

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from '@/lib/zod';
import { MapPin, AtSign, Smartphone, AlertCircle, ChevronDown } from 'lucide-react';
import Image from 'next/image';
import { toast } from 'sonner';
import api from '@/lib/api';

const SERVICES = [
  "ایمپلنت دندان",
  "طراحی لبخند دیجیتال",
  "پروتزهای ثابت و متحرک",
  "ترمیم و زیبایی",
  "بلیچینگ",
];

// Validation Schema
const contactSchema = z.object({
  first_name: z.string().min(2, "نام باید حداقل ۲ حرف باشد"),
  last_name: z.string().min(2, "نام خانوادگی باید حداقل ۲ حرف باشد"),
  address: z.string().min(5, "آدرس وارد شده کوتاه است"),
  phone: z.string().regex(/^09\d{9}$/, "شماره موبایل معتبر نیست (مثال: 09123456789)"),
  service: z.string().min(1, "لطفاً یک سرویس را انتخاب کنید"),
  message: z.string().min(10, "پیام شما باید حداقل ۱۰ حرف باشد"),
});

type ContactFormValues = z.infer<typeof contactSchema>;

export default function Footer() {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { register, handleSubmit, formState: { errors }, reset } = useForm<ContactFormValues>({
    resolver: zodResolver(contactSchema),
    defaultValues: { service: "" }
  });

  const onSubmit = async (data: ContactFormValues) => {
    setIsSubmitting(true);
    try {
      // ۱. تبدیل شماره موبایل به فرمت +98
      let formattedPhone = data.phone.trim();
      if (formattedPhone.startsWith("09")) {
        formattedPhone = "+98" + formattedPhone.substring(1);
      }

      // ۲. ساخت متن پیام ترکیبی برای ارسال به چت پشتیبانی
      const messageBody = `سرویس مورد نظر: ${data.service}\nآدرس: ${data.address}\n\nمتن پیام:\n${data.message}`;

      // ۳. ارسال به مسیر مهمان
      await api.post('/chat/guest-message/', {
        phone_number: formattedPhone,
        first_name: data.first_name,
        last_name: data.last_name,
        body: messageBody
      });

      toast.success("پیام شما با موفقیت ارسال شد. برای پیگیری درخواست خود لطفا با همین شماره همراه وارد حساب کاربری خود شده، یا اگر حساب کاربری ندارید، با همین شماره همراه حساب خود را بسازید.", {
        duration: 8000,
      });

      reset();
    } catch (err: any) {
      const errMsg = err.response?.data?.detail || "خطا در ارسال پیام. لطفا دوباره تلاش کنید.";
      toast.error(errMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <footer dir="rtl" className="relative w-full pt-8 mt-0 overflow-hidden">

      {/* ================= Background Gradient ================= */}
      <div className="absolute bottom-0 left-0 w-full h-[85%] bg-[linear-gradient(180deg,#FFFFFF_0%,#E1FCFC_33%,#CDF7FF_68%,#B5FBFF_100%)] z-0 pointer-events-none"></div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-6" id="contact">

        {/* Main Title */}
        <h2 className="text-3xl md:text-4xl font-bold text-center text-slate-900 mb-10">
          تماس با ما
        </h2>

        {/* ================= Contact Box ================= */}
        <div className="relative bg-[linear-gradient(180deg,#ECFCFD_0%,#E0F5F8_86%,#D9F2F5_100%)] rounded-[40px] shadow-sm border border-white/50 p-6 pb-14 md:p-10 lg:p-12 mb-12">

          <h3 className="text-xl md:text-3xl font-medium md:font-bold text-slate-900 mb-8 text-center md:text-right">
            فرم سوالات و درخواست مشاوره
          </h3>

          <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12">

            {/* --- Right Column (Inputs & Button) --- */}
            <div className="flex flex-col gap-5">

              {/* نام و نام خانوادگی (دو فیلد مجزا) */}
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-bold text-slate-700">نام:</label>
                  <input
                    {...register("first_name")}
                    type="text"
                    className="w-full bg-[#FAFAFA] border-[0.5px] border-[#636363] rounded-2xl px-4 py-3 outline-none transition-all duration-300 hover:border-[#32A6B7] hover:shadow-[0_0_10px_rgba(50,166,183,0.1)] focus:border-[#32A6B7] focus:ring-1 focus:ring-[#32A6B7]"
                  />
                  {errors.first_name && <span className="text-xs text-red-500 font-medium flex items-center gap-1"><AlertCircle size={14} /> {errors.first_name.message}</span>}
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-bold text-slate-700">نام خانوادگی:</label>
                  <input
                    {...register("last_name")}
                    type="text"
                    className="w-full bg-[#FAFAFA] border-[0.5px] border-[#636363] rounded-2xl px-4 py-3 outline-none transition-all duration-300 hover:border-[#32A6B7] hover:shadow-[0_0_10px_rgba(50,166,183,0.1)] focus:border-[#32A6B7] focus:ring-1 focus:ring-[#32A6B7]"
                  />
                  {errors.last_name && <span className="text-xs text-red-500 font-medium flex items-center gap-1"><AlertCircle size={14} /> {errors.last_name.message}</span>}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-bold text-slate-700">آدرس:</label>
                <input
                  {...register("address")}
                  type="text"
                  className="w-full bg-[#FAFAFA] border-[0.5px] border-[#636363] rounded-2xl px-4 py-3 outline-none transition-all duration-300 hover:border-[#32A6B7] hover:shadow-[0_0_10px_rgba(50,166,183,0.1)] focus:border-[#32A6B7] focus:ring-1 focus:ring-[#32A6B7]"
                />
                {errors.address && <span className="text-xs text-red-500 font-medium flex items-center gap-1"><AlertCircle size={14} /> {errors.address.message}</span>}
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-bold text-slate-700">شماره تماس:</label>
                <input
                  {...register("phone")}
                  type="tel"
                  dir="ltr"
                  className="w-full text-left bg-[#FAFAFA] border-[0.5px] border-[#636363] rounded-2xl px-4 py-3 outline-none transition-all duration-300 hover:border-[#32A6B7] hover:shadow-[0_0_10px_rgba(50,166,183,0.1)] focus:border-[#32A6B7] focus:ring-1 focus:ring-[#32A6B7]"
                />
                {errors.phone && <span className="text-xs text-red-500 font-medium flex items-center gap-1"><AlertCircle size={14} /> {errors.phone.message}</span>}
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full rounded-full bg-[linear-gradient(90deg,#2993A3_0%,#75C1C7_100%)] py-3.5 text-base font-bold text-white shadow-md transition-all hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed mt-2"
              >
                {isSubmitting ? 'در حال ارسال...' : 'ثبت پیام'}
              </button>
            </div>

            {/* --- Left Column (Select & Textarea) --- */}
            <div className="flex flex-col gap-5 h-full">

              <div className="flex flex-col gap-2 relative h-18">
                <div className="relative">
                  <select
                    {...register("service")}
                    className="w-full bg-[#FAFAFA] border-[0.5px] border-[#636363] rounded-2xl px-4 py-3 outline-none transition-all duration-300 hover:border-[#32A6B7] hover:shadow-[0_0_10px_rgba(50,166,183,0.1)] focus:border-[#32A6B7] focus:ring-1 focus:ring-[#32A6B7] appearance-none text-slate-600"
                  >
                    <option value="" disabled>سرویس مورد نظر را انتخاب کنید</option>
                    {SERVICES.map(srv => <option key={srv} value={srv}>{srv}</option>)}
                  </select>
                  <ChevronDown className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 pointer-events-none" />
                </div>
                {errors.service && <span className="text-xs text-red-500 font-medium flex items-center gap-1"><AlertCircle size={14} /> {errors.service.message}</span>}
              </div>

              <div className="flex flex-col gap-2 grow">
                <textarea
                  {...register("message")}
                  placeholder="پیام خود را برای ما بنویسید..."
                  className="w-full h-full min-h-40 md:min-h-0 bg-[#FAFAFA] border-[0.5px] border-[#636363] rounded-2xl px-4 py-4 outline-none transition-all duration-300 hover:border-[#32A6B7] hover:shadow-[0_0_10px_rgba(50,166,183,0.1)] focus:border-[#32A6B7] focus:ring-1 focus:ring-[#32A6B7] resize-none"
                ></textarea>
                {errors.message && <span className="text-xs text-red-500 font-medium flex items-center gap-1"><AlertCircle size={14} /> {errors.message.message}</span>}
              </div>

            </div>
          </form>

          {/* Divider */}
          <div className="w-full h-px bg-slate-200 my-12"></div>

          {/* ================= Lower Info Section ================= */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center relative pb-16 md:pb-0">

            {/* --- Right: Contact Details --- */}
            <div className="flex flex-col gap-6 text-lg font-bold text-slate-800">
              <div className="flex items-center gap-3">
                <MapPin className="text-[#32A6B7] w-6 h-6" strokeWidth={2.5} />
                <span>آدرس: <span className="font-medium text-base text-slate-600">تهران، خیابان ولیعصر، تقاطع مطهری، پلاک ۱۲۳</span></span>
              </div>
              <div className="flex items-center gap-3">
                <AtSign className="text-[#32A6B7] w-6 h-6" strokeWidth={2.5} />
                <span>ایمیل: <span className="font-medium text-base text-slate-600 font-sans">info@dentalclinic.com</span></span>
              </div>
              <div className="flex items-center gap-3">
                <Smartphone className="text-[#32A6B7] w-6 h-6" strokeWidth={2.5} />
                <span>شماره تلفن: <span className="font-medium text-base text-slate-600 font-sans dir-ltr inline-block">۰۲۱ - ۸۸۸۸۸۸۸۸</span></span>
              </div>
            </div>

            {/* --- Left: Google Map Placeholder --- */}
            <div className="w-full h-50 bg-slate-200 rounded-3xl overflow-hidden shadow-inner border border-slate-300 relative">
              <iframe className='w-full h-full' title="map-iframe" src="https://neshan.org/maps/iframe/places/_bZllAYxaqcX#c32.622-51.667-16z-0p/32.6223264818596/51.664500337799524" allowFullScreen loading="lazy" ></iframe>
            </div>

            {/* --- Decorative Teeth Image --- */}
            <div className="absolute -bottom-14 md:-bottom-12 left-[55%] -translate-x-1/2 flex items-end justify-center pointer-events-none">
              <div className="w-25 h-25 backdrop-blur-md rounded-full flex items-center justify-center text-xs font-bold text-slate-400 relative">
                <Image src={"/images/footer_image.png"} fill alt='' />
              </div>
            </div>

          </div>
        </div>

        {/* ================= Bottom Footer Bar ================= */}
        <div className="flex flex-col-reverse sm:flex-row justify-between items-center gap-4 px-4">
          <p className="text-slate-800 font-bold text-sm md:text-base">
            تمام حقوق محفوظ است
          </p>

          <div className="flex items-center gap-4">
            {/* WhatsApp Icon */}
            <a href="#" className="w-10 h-10 bg-[#25D366] text-white rounded-full flex items-center justify-center shadow-md transition-transform hover:scale-110">
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12.031 0C5.385 0 0 5.385 0 12.031c0 2.128.552 4.137 1.543 5.92L0 24l6.195-1.625c1.722.898 3.655 1.411 5.69 1.411 6.646 0 12.031-5.385 12.031-12.031S18.677 0 12.031 0zm0 21.657c-1.802 0-3.513-.46-5.029-1.328l-.36-.214-3.738.98 1.002-3.642-.234-.373A9.871 9.871 0 0 1 2.158 12.03c0-5.452 4.437-9.889 9.889-9.889 5.452 0 9.889 4.437 9.889 9.889 0 5.452-4.437 9.889-9.889 9.889zm5.422-7.411c-.298-.15-1.758-.868-2.03-.967-.272-.099-.47-.15-.668.15-.198.298-.767.967-.94 1.165-.173.199-.347.223-.645.074-.298-.15-1.255-.462-2.39-1.475-.882-.788-1.478-1.761-1.65-2.06-.173-.298-.018-.46.13-.61.134-.135.298-.348.447-.521.15-.174.2-.298.298-.497.099-.199.05-.373-.025-.521-.074-.15-.668-1.611-.915-2.206-.241-.579-.487-.501-.668-.51l-.57-.01c-.198 0-.52.074-.793.373-.272.298-1.04 1.016-1.04 2.477 0 1.46 1.064 2.871 1.213 3.07.149.198 2.095 3.2 5.076 4.487.71.307 1.264.49 1.694.627.712.227 1.36.195 1.871.118.574-.087 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414-.074-.124-.272-.198-.57-.347z" />
              </svg>
            </a>

            {/* Instagram Icon */}
            <a href="#" className="w-10 h-10 bg-linear-to-tr from-[#f09433] via-[#dc2743] to-[#bc1888] text-white rounded-full flex items-center justify-center shadow-md transition-transform hover:scale-110">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path fillRule="evenodd" d="M12.315 2c2.43 0 2.784.013 3.808.06 1.064.049 1.791.218 2.427.465a4.902 4.902 0 011.772 1.153 4.902 4.902 0 011.153 1.772c.247.636.416 1.363.465 2.427.048 1.067.06 1.407.06 4.123v.08c0 2.643-.012 2.987-.06 4.043-.049 1.064-.218 1.791-.465 2.427a4.902 4.902 0 01-1.153 1.772 4.902 4.902 0 01-1.772 1.153c-.636.247-1.363.416-2.427.465-1.067.048-1.407.06-4.123.06h-.08c-2.643 0-2.987-.012-4.043-.06-1.064-.049-1.791-.218-2.427-.465a4.902 4.902 0 01-1.772-1.153 4.902 4.902 0 01-1.153-1.772c-.247-.636-.416-1.363-.465-2.427-.047-1.024-.06-1.379-.06-3.808v-.63c0-2.43.013-2.784.06-3.808.049-1.064.218-1.791.465-2.427a4.902 4.902 0 011.153-1.772A4.902 4.902 0 015.45 2.525c.636-.247 1.363-.416 2.427-.465C8.901 2.013 9.256 2 11.685 2h.63zm-.081 1.802h-.468c-2.456 0-2.784.011-3.807.058-.975.045-1.504.207-1.857.344-.467.182-.8.398-1.15.748-.35.35-.566.683-.748 1.15-.137.353-.3.882-.344 1.857-.047 1.023-.058 1.351-.058 3.807v.468c0 2.456.011 2.784.058 3.807.045.975.207 1.504.344 1.857.182.466.399.8.748 1.15.35.35.683.566 1.15.748.353.137.882.3 1.857.344 1.054.048 1.37.058 4.041.058h.08c2.597 0 2.917-.01 3.96-.058.976-.045 1.505-.207 1.858-.344.466-.182.8-.398 1.15-.748.35-.35.566-.683.748-1.15.137-.353.3-.882.344-1.857.048-1.055.058-1.37.058-4.041v-.08c0-2.597-.01-2.917-.058-3.96-.045-.976-.207-1.505-.344-1.858a3.097 3.097 0 00-.748-1.15 3.098 3.098 0 00-1.15-.748c-.353-.137-.882-.3-1.857-.344-1.023-.047-1.351-.058-3.807-.058zM12 6.865a5.135 5.135 0 110 10.27 5.135 5.135 0 010-10.27zm0 1.802a3.333 3.333 0 100 6.666 3.333 3.333 0 000-6.666zm5.338-3.205a1.2 1.2 0 110 2.4 1.2 1.2 0 010-2.4z" clipRule="evenodd" />
              </svg>
            </a>
          </div>
        </div>

      </div>
    </footer>
  );
}
