'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'sonner';
import {
  addMonths, subMonths, format as jFormat, startOfMonth, endOfMonth,
  eachDayOfInterval, getDay, isSameDay, isBefore, startOfDay,
  differenceInCalendarMonths
} from 'date-fns-jalali';
import { format as gFormat } from 'date-fns';
import { ChevronRight, ChevronLeft, AlertCircle } from 'lucide-react';
import api from '@/lib/api';

const bookingSchema = z.object({
  service: z.string().min(1, "لطفا یک سرویس را انتخاب کنید"),
  first_name: z.string().min(2, "نام باید حداقل ۲ حرف باشد"),
  last_name: z.string().min(2, "نام خانوادگی باید حداقل ۲ حرف باشد"),
  phone_number: z.string().regex(/^09\d{9}$/, "شماره موبایل معتبر نیست (مثال: 09123456789)"),
  date: z.string().min(1, "لطفا یک روز را از تقویم انتخاب کنید"),
  time: z.string().min(1, "ساعت مراجعه را انتخاب کنید"),
});

type BookingFormValues = z.infer<typeof bookingSchema>;

const SERVICES = [
  "ایمپلنت دندان",
  "طراحی لبخند دیجیتال",
  "پروتزهای ثابت و متحرک",
  "ترمیم و زیبایی",
  "بلیچینگ",
];

const WEEK_DAYS = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه'];

export default function BookingSection() {
  const today = startOfDay(new Date());
  const [currentMonth, setCurrentMonth] = useState(today);
  const [selectedDateObj, setSelectedDateObj] = useState<Date | null>(null);

  const [availableSlots, setAvailableSlots] = useState<any[]>([]);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedSlotId, setSelectedSlotId] = useState<number | null>(null);
  const idempotencyKeyRef = useRef<string | null>(null);

  const { register, handleSubmit, setValue, watch, formState: { errors }, reset } = useForm<BookingFormValues>({
    resolver: zodResolver(bookingSchema),
    defaultValues: { service: SERVICES[0] }
  });

  const watchDate = watch("date");

  useEffect(() => {
    const fetchSlots = async () => {
      setIsLoadingSlots(true);
      try {
        const start = gFormat(startOfMonth(currentMonth), 'yyyy-MM-dd');
        const end = gFormat(endOfMonth(currentMonth), 'yyyy-MM-dd');

        let allSlots: any[] = [];
        let url: string | null = `/appointments/slots/?start_date=${start}&end_date=${end}&_t=${Date.now()}`;

        // دریافت تمام صفحات (Pagination)
        while (url) {
          const res: any = await api.get(url);
          const data = res.data;

          if (Array.isArray(data)) {
            allSlots = allSlots.concat(data);
            url = null;
          } else {
            allSlots = allSlots.concat(data.results);
            if (data.next) {
              try {
                const nextUrl = new URL(data.next);
                url = (nextUrl.pathname + nextUrl.search).replace('/api/v1', '');
              } catch {
                url = null;
              }
            } else {
              url = null;
            }
          }
        }

        setAvailableSlots(allSlots);
      } catch (err) {
        console.error("Failed to fetch slots", err);
      } finally {
        setIsLoadingSlots(false);
      }
    };
    fetchSlots();
  }, [currentMonth]);

  const slotsByDate = useMemo(() => {
    const map: Record<string, any[]> = {};
    availableSlots.forEach(slot => {
      const dateKey = slot.date || slot.start_at.slice(0, 10);
      if (!map[dateKey]) map[dateKey] = [];
      map[dateKey].push(slot);
    });
    return map;
  }, [availableSlots]);

  const availableHoursForSelectedDate = useMemo(() => {
    if (!selectedDateObj) return [];
    const dateKey = gFormat(selectedDateObj, 'yyyy-MM-dd');
    return (slotsByDate[dateKey] || []).sort((a, b) => a.start_at.localeCompare(b.start_at));
  }, [selectedDateObj, slotsByDate]);

  const onSubmit = async (data: BookingFormValues) => {
    if (!selectedSlotId) {
      toast.error("لطفا یک ساعت معتبر را انتخاب کنید.");
      return;
    }

    setIsSubmitting(true);
    try {
      // تبدیل شماره موبایل به فرمت E.164 (+98...)
      let formattedPhone = data.phone_number.trim();
      if (formattedPhone.startsWith("09")) {
        formattedPhone = "+98" + formattedPhone.substring(1);
      }

      // ارسال به مسیر مهمان (guest)
      idempotencyKeyRef.current ??= crypto.randomUUID();
      await api.post(
        '/appointments/guest/',
        {
          slot_id: selectedSlotId,
          phone_number: formattedPhone,
          first_name: data.first_name,
          last_name: data.last_name,
          reason: data.service,
        },
        { headers: { 'Idempotency-Key': idempotencyKeyRef.current } },
      );

      // پیام موفقیت آمیز بودن
      toast.success("رزرو نوبت موفقیت آمیز بود. برای پیگیری درخواست خود لطفا با همین شماره همراه وارد حساب کاربری خود شده، یا اگر حساب کاربری ندارید، با همین شماره همراه حساب خود را بسازید.", {
        duration: 8000, // نمایش طولانی‌تر برای خواندن پیام
      });

      // حذف اسلات رزرو شده از لیست
      setAvailableSlots(prev => prev.filter(s => s.id !== selectedSlotId));

      // ریست کردن فرم
      reset({ service: SERVICES[0], first_name: "", last_name: "", phone_number: "", time: "", date: "" });
      setSelectedDateObj(null);
      setSelectedSlotId(null);
      idempotencyKeyRef.current = null;

    } catch (err: any) {
      const errMsg = err.response?.data?.detail || "خطا در ثبت نوبت. لطفا دوباره تلاش کنید.";
      toast.error(errMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const monthDiff = differenceInCalendarMonths(currentMonth, today);
  const canGoNext = monthDiff < 1;
  const canGoPrev = monthDiff > -1;

  const nextMonth = () => canGoNext && setCurrentMonth(addMonths(currentMonth, 1));
  const prevMonth = () => canGoPrev && setCurrentMonth(subMonths(currentMonth, 1));

  const daysInMonth = useMemo(() => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    const days = eachDayOfInterval({ start, end });
    const startDayIndex = (getDay(start) + 1) % 7;
    const padding = Array.from({ length: startDayIndex }, () => null);
    return [...padding, ...days];
  }, [currentMonth]);

  const handleDateClick = (date: Date, isSelectable: boolean) => {
    if (!isSelectable) return;
    const dateStr = jFormat(date, 'yyyy-MM-dd');
    setSelectedDateObj(date);
    setSelectedSlotId(null);
    setValue("date", dateStr, { shouldValidate: true });
    setValue("time", "");
  };

  const handleTimeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const slotId = Number(e.target.value);
    setSelectedSlotId(slotId);
    const slot = availableHoursForSelectedDate.find(s => s.id === slotId);
    if (slot) {
      setValue("time", slot.start_at.slice(11, 16));
    }
  };

  return (
    <section className="w-full py-16 px-4 sm:px-6 lg:px-8 max-w-[1200px] mx-auto" dir="rtl" id="slots">
      <div className="mb-12">
        <h2 className="text-2xl md:text-4xl text-center md:text-right font-extrabold text-slate-900">
          رزرو نوبت مراجعه و اسکن دیجیتال
        </h2>
      </div>

      <div className="flex flex-col lg:flex-row gap-10 lg:gap-16 items-start">

        {/* ================= تقویم ================= */}
        <div className="w-full lg:w-[45%] bg-white rounded-[32px] p-6 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.08)] border border-slate-100">
          <div className="flex justify-between items-center mb-8 px-2">
            <button onClick={nextMonth} disabled={!canGoNext} type="button" className="p-2 rounded-full hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
              <ChevronRight className="w-6 h-6 text-slate-700" />
            </button>
            <h3 className="text-xl font-bold text-slate-900">
              {jFormat(currentMonth, 'MMMM yyyy')}
            </h3>
            <button onClick={prevMonth} disabled={!canGoPrev} type="button" className="p-2 rounded-full hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
              <ChevronLeft className="w-6 h-6 text-slate-700" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-2 mb-4 border-b border-slate-100 pb-4">
            {WEEK_DAYS.map(day => (
              <div key={day} className="text-center text-xs font-bold text-slate-400">{day}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-y-3 gap-x-2">
            {daysInMonth.map((date, i) => {
              if (!date) return <div key={`empty-${i}`} className="h-10 w-10 md:h-12 md:w-12" />;

              const dateStr = gFormat(date, 'yyyy-MM-dd');
              const dayOfMonth = jFormat(date, 'd');
              const isFriday = getDay(date) === 5;
              const isPast = isBefore(date, today) && !isSameDay(date, today);

              const daySlots = slotsByDate[dateStr] || [];
              const hasSlots = daySlots.length > 0;
              const isSelectable = !isPast && !isFriday && hasSlots;

              let buttonStyle = "bg-white text-slate-700 hover:border-[#00D9FF] hover:border-2";
              if (isSelectable && selectedDateObj && isSameDay(date, selectedDateObj)) {
                buttonStyle = "border-2 border-[#00D9FF] bg-cyan-50/50 text-slate-900 font-bold shadow-sm";
              } else if (isPast) {
                buttonStyle = "text-slate-300 opacity-50 cursor-not-allowed";
              } else if (isFriday) {
                buttonStyle = "bg-slate-100 text-red-500 border border-red-200 cursor-not-allowed";
              } else if (!hasSlots) {
                buttonStyle = "bg-slate-50 text-slate-300 border border-slate-100 cursor-not-allowed";
              }

              return (
                <div key={dateStr} className="relative group flex justify-center">
                  <button
                    type="button"
                    onClick={() => handleDateClick(date, isSelectable)}
                    disabled={!isSelectable}
                    className={`h-10 w-10 md:h-12 md:w-12 rounded-xl flex items-center justify-center text-sm md:text-base transition-all duration-200 ${buttonStyle}`}
                  >
                    {dayOfMonth}
                  </button>

                  {!hasSlots && !isPast && !isFriday && (
                    <div className="absolute -top-12 scale-0 group-hover:scale-100 transition-transform bg-slate-800 text-white text-xs py-1.5 px-3 rounded-lg whitespace-nowrap z-10 pointer-events-none shadow-lg after:content-[''] after:absolute after:top-full after:left-1/2 after:-translate-x-1/2 after:border-4 after:border-transparent after:border-t-slate-800">
                      روز کاری نیست
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ================= فرم ثبت نام ================= */}
        <div className="w-full lg:w-[55%]">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">

            {/* سرویس */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-bold text-slate-700">سرویس:</label>
              <div className="relative">
                <select
                  {...register("service")}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 outline-none focus:border-[#2993A3] focus:ring-1 focus:ring-[#2993A3] transition-all appearance-none"
                >
                  {SERVICES.map(srv => <option key={srv} value={srv}>{srv}</option>)}
                </select>
                <ChevronLeft className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none -rotate-90" />
              </div>
              {errors.service && <span className="text-xs text-red-500">{errors.service.message}</span>}
            </div>

            {/* نام و نام خانوادگی */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-bold text-slate-700">نام:</label>
                <input
                  {...register("first_name")}
                  type="text"
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 outline-none focus:border-[#2993A3] focus:ring-1 focus:ring-[#2993A3] transition-all"
                  placeholder="نام"
                />
                {errors.first_name && <span className="text-xs text-red-500">{errors.first_name.message}</span>}
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-bold text-slate-700">نام خانوادگی:</label>
                <input
                  {...register("last_name")}
                  type="text"
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 outline-none focus:border-[#2993A3] focus:ring-1 focus:ring-[#2993A3] transition-all"
                  placeholder="نام خانوادگی"
                />
                {errors.last_name && <span className="text-xs text-red-500">{errors.last_name.message}</span>}
              </div>
            </div>

            {/* شماره تلفن */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-bold text-slate-700">شماره تلفن همراه:</label>
              <input
                {...register("phone_number")}
                type="tel"
                placeholder="مثال: 0912..."
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 outline-none focus:border-[#2993A3] focus:ring-1 focus:ring-[#2993A3] transition-all text-left"
                dir="ltr"
              />
              {errors.phone_number && <span className="text-xs text-red-500">{errors.phone_number.message}</span>}
            </div>

            {/* تاریخ و ساعت */}
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 flex flex-col gap-2">
                <label className="text-sm font-bold text-slate-700">تاریخ مراجعه:</label>
                <div className="w-full rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-3.5 text-slate-600 font-medium h-[54px] flex items-center">
                  {selectedDateObj ? jFormat(selectedDateObj, 'd MMMM') : 'انتخاب از تقویم'}
                </div>
                <input type="hidden" {...register("date")} />
              </div>

              <div className="flex-1 flex flex-col gap-2">
                <label className="text-sm font-bold text-slate-700">ساعت مراجعه:</label>
                <div className="relative">
                  <select
                    value={selectedSlotId || ""}
                    onChange={handleTimeChange}
                    disabled={!watchDate || isLoadingSlots || availableHoursForSelectedDate.length === 0}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 outline-none focus:border-[#2993A3] focus:ring-1 focus:ring-[#2993A3] transition-all appearance-none disabled:bg-slate-50 disabled:text-slate-400 disabled:border-slate-100 disabled:cursor-not-allowed"
                  >
                    <option value="">{isLoadingSlots ? 'در حال بررسی...' : 'ساعت'}</option>
                    {availableHoursForSelectedDate.map(slot => (
                      <option key={slot.id} value={slot.id}>
                        {slot.start_at.slice(11, 16)}
                      </option>
                    ))}
                  </select>
                  <ChevronLeft className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none -rotate-90" />
                </div>
              </div>
            </div>

            <div className="min-h-[24px]">
              {errors.date && <p className="text-xs text-red-500 font-medium flex items-center gap-1.5"><AlertCircle size={14} /> {errors.date.message}</p>}
              {!errors.date && errors.time && <p className="text-xs text-red-500 font-medium flex items-center gap-1.5"><AlertCircle size={14} /> {errors.time.message}</p>}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full lg:w-auto min-w-[200px] rounded-full bg-gradient-to-r from-[#2993A3] to-[#75C1C7] px-8 py-4 text-base font-bold text-white shadow-[0_4px_14px_0_rgba(41,147,163,0.39)] transition-all hover:shadow-[0_6px_20px_rgba(41,147,163,0.23)] hover:scale-[1.02] active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:scale-100 mt-2 float-left"
            >
              {isSubmitting ? 'در حال ثبت...' : 'ثبت نوبت'}
            </button>
            <div className="clear-both"></div>

          </form>
        </div>
      </div>
    </section>
  );
}
