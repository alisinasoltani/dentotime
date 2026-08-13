"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import {
    addMonths, subMonths, format as jFormat, startOfMonth, endOfMonth,
    eachDayOfInterval, getDay, isSameDay, isBefore, startOfDay,
    differenceInCalendarMonths
} from "date-fns-jalali";
import { format as gFormat } from "date-fns";
import { ChevronRight, ChevronLeft, AlertCircle, Loader2 } from "lucide-react";
import api from "@/lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

const bookingSchema = z.object({
    service: z.string().min(1, "لطفا یک سرویس را انتخاب کنید"),
    fullName: z.string().min(3, "نام کامل باید حداقل ۳ حرف باشد"),
    phone: z.string().regex(/^09\d{9}$/, "شماره موبایل معتبر نیست (مثال: 09123456789)"),
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

interface BookingModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export default function BookingModal({ isOpen, onClose, onSuccess }: BookingModalProps) {
    const today = startOfDay(new Date());
    const [currentMonth, setCurrentMonth] = useState(today);
    const [selectedDateObj, setSelectedDateObj] = useState<Date | null>(null);

    const [availableSlots, setAvailableSlots] = useState<any[]>([]);
    const [isLoadingSlots, setIsLoadingSlots] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [selectedSlotId, setSelectedSlotId] = useState<number | null>(null);
    const idempotencyKeyRef = useRef<string | null>(null);

    const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm<BookingFormValues>({
        resolver: zodResolver(bookingSchema),
        defaultValues: { service: SERVICES[0] }
    });

    const watchDate = watch("date");

    // دریافت اطلاعات کاربر برای پر کردن خودکار نام و شماره
    useEffect(() => {
        if (isOpen) {
            const fetchUserData = async () => {
                try {
                    const res = await api.get("/users/me/");
                    const user = res.data;

                    // اصلاح پیش‌شماره +98 به 0
                    let rawPhone = user.phone_number || "";
                    if (rawPhone.startsWith("+98")) {
                        rawPhone = "0" + rawPhone.slice(3);
                    } else if (rawPhone.startsWith("0098")) {
                        rawPhone = "0" + rawPhone.slice(4);
                    }

                    reset({
                        fullName: `${user.first_name || ""} ${user.last_name || ""}`.trim(),
                        phone: rawPhone,
                        service: SERVICES[0],
                        date: "",
                        time: ""
                    });
                } catch (err) {
                    console.error("Failed to fetch user data", err);
                }
            };
            fetchUserData();
        }
    }, [isOpen, reset]);

    // دریافت اسلات‌های ماه جاری
    useEffect(() => {
        if (!isOpen) return;

        const fetchSlots = async () => {
            setIsLoadingSlots(true);
            try {
                const start = gFormat(startOfMonth(currentMonth), 'yyyy-MM-dd');
                const end = gFormat(endOfMonth(currentMonth), 'yyyy-MM-dd');

                let allSlots: any[] = [];
                let url: string | null = `/appointments/slots/?start_date=${start}&end_date=${end}&_t=${Date.now()}`;

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
    }, [currentMonth, isOpen]);

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
            idempotencyKeyRef.current ??= crypto.randomUUID();
            await api.post(
                '/appointments/',
                { slot_id: selectedSlotId, reason: data.service },
                { headers: { 'Idempotency-Key': idempotencyKeyRef.current } },
            );

            toast.success("نوبت شما با موفقیت ثبت شد! منتظر تایید ادمین باشید.");

            reset({ fullName: data.fullName, phone: data.phone, service: SERVICES[0], date: "", time: "" });
            setSelectedDateObj(null);
            setSelectedSlotId(null);
            idempotencyKeyRef.current = null;
            onSuccess();
            onClose();
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
        <Dialog open={isOpen} onOpenChange={onClose}>
            {/* اصلاح کلاس‌های مودال: حذف grid پیش‌فرض، جلوگیری از اسکرول افقی */}
            <DialogContent className="sm:max-w-[1100px] w-full p-0 gap-0 flex flex-col max-h-[90vh] overflow-y-auto overflow-x-hidden">
                <DialogHeader className="p-6 pb-0 shrink-0">
                    <DialogTitle className="text-xl font-bold text-gray-800">ثبت نوبت جدید</DialogTitle>
                </DialogHeader>

                {/* استفاده از div ساده به جای ScrollArea */}
                <div className="w-full p-6 md:p-8">
                    {/* استفاده از grid به جای flex برای تخصیص دقیق فضا */}
                    <div className="w-full grid grid-cols-1 lg:grid-cols-5 gap-10 lg:gap-16 items-start" dir="rtl">

                        {/* ================= تقویم ================= */}
                        {/* اختصاص 2 ستون از 5 ستون به تقویم (معادل 40%) */}
                        <div className="w-full lg:col-span-2 bg-white rounded-[32px] p-6 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.08)] border border-slate-100">
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
                                    <div key={day} className="text-center text-[7.5px] md:text-xs font-bold text-slate-400">{day}</div>
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
                                                className={`h-8 w-8 aspect-square md:h-12 md:w-12 rounded-xl flex items-center justify-center text-sm md:text-base transition-all duration-200 ${buttonStyle}`}
                                            >
                                                {dayOfMonth}
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* ================= فرم ثبت نام ================= */}
                        {/* اختصاص 3 ستون از 5 ستون به فرم (معادل 60%) */}
                        <div className="w-full lg:col-span-3">
                            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
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

                                <div className="flex flex-col gap-2">
                                    <label className="text-sm font-bold text-slate-700">نام و نام خانوادگی:</label>
                                    <input
                                        {...register("fullName")}
                                        type="text"
                                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 outline-none focus:border-[#2993A3] focus:ring-1 focus:ring-[#2993A3] transition-all"
                                    />
                                    {errors.fullName && <span className="text-xs text-red-500">{errors.fullName.message}</span>}
                                </div>

                                <div className="flex flex-col gap-2">
                                    <label className="text-sm font-bold text-slate-700">شماره تلفن همراه:</label>
                                    <input
                                        {...register("phone")}
                                        type="tel"
                                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 outline-none focus:border-[#2993A3] focus:ring-1 focus:ring-[#2993A3] transition-all text-left"
                                        dir="ltr"
                                    />
                                    {errors.phone && <span className="text-xs text-red-500">{errors.phone.message}</span>}
                                </div>

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
                                    className="w-full lg:w-auto min-w-[200px] rounded-full bg-gradient-to-r from-[#2993A3] to-[#75C1C7] px-8 py-4 text-base font-bold text-white shadow-[0_4px_14px_0_rgba(41,147,163,0.39)] transition-all hover:shadow-[0_6px_20px_rgba(41,147,163,0.23)] hover:scale-[1.02] active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:scale-100 mt-2 float-left flex items-center justify-center gap-2"
                                >
                                    {isSubmitting ? (
                                        <>
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                            در حال ثبت...
                                        </>
                                    ) : (
                                        'ثبت نوبت'
                                    )}
                                </button>
                                <div className="clear-both"></div>
                            </form>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
