"use client";

import { useState, useEffect, useMemo } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import {
    addMonths, subMonths, format as jFormat, startOfMonth, endOfMonth,
    eachDayOfInterval, getDay, isSameDay, isBefore, startOfDay,
    differenceInCalendarMonths
} from "date-fns-jalali";
import { format as gFormat } from "date-fns";
import { ChevronRight, ChevronLeft, Clock, PlusCircle, Loader2, Trash2 } from "lucide-react"; // Trash2 اضافه شد
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { AxiosResponse } from "axios";

interface AppointmentSlot {
    id: string | number;
    date?: string;
    start_at: string;
    end_at: string;
    status: string;
    is_booked?: boolean;
}

interface PaginatedSlots {
    results: AppointmentSlot[];
    next: string | null;
}

type SlotsResponse = AppointmentSlot[] | PaginatedSlots;

const WEEK_DAYS = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه'];

export default function SlotsManagementPage() {
    const today = startOfDay(new Date());
    const [currentMonth, setCurrentMonth] = useState(today);
    const [selectedDateObj, setSelectedDateObj] = useState<Date | null>(null);

    const [startTime, setStartTime] = useState("10:00");
    const [endTime, setEndTime] = useState("11:00");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [deletingId, setDeletingId] = useState<string | number | null>(null);

    const [slotsByDate, setSlotsByDate] = useState<Record<string, AppointmentSlot[]>>({});
    const [isLoadingSlots, setIsLoadingSlots] = useState(false);

    useEffect(() => {
        const fetchSlots = async () => {
            setIsLoadingSlots(true);
            try {
                const start = gFormat(startOfMonth(currentMonth), 'yyyy-MM-dd');
                const end = gFormat(endOfMonth(currentMonth), 'yyyy-MM-dd');

                let allSlots: AppointmentSlot[] = [];
                let url: string | null = `/appointments/slots/?start_date=${start}&end_date=${end}&_t=${Date.now()}`;

                while (url) {
                    const res: AxiosResponse<SlotsResponse> = await api.get<SlotsResponse>(url);
                    const data: SlotsResponse = res.data;

                    if (Array.isArray(data)) {
                        allSlots = allSlots.concat(data);
                        url = null;
                    } else {
                        allSlots = allSlots.concat(data.results);
                        if (data.next) {
                            try {
                                const nextUrl: URL = new URL(data.next);
                                const pathWithQuery: string = nextUrl.pathname + nextUrl.search;
                                url = pathWithQuery.replace('/api/v1', '');
                            } catch {
                                url = null;
                            }
                        } else {
                            url = null;
                        }
                    }
                }

                const map: Record<string, AppointmentSlot[]> = {};
                allSlots.forEach((slot) => {
                    const dateKey = slot.date || slot.start_at.slice(0, 10);
                    if (!map[dateKey]) map[dateKey] = [];
                    map[dateKey].push(slot);
                });

                setSlotsByDate(map);
            } catch (err) {
                console.error("Failed to fetch slots", err);
            } finally {
                setIsLoadingSlots(false);
            }
        };
        fetchSlots();
    }, [currentMonth]);

    const monthDiff = differenceInCalendarMonths(currentMonth, today);
    const canGoNext = monthDiff < 2;
    const canGoPrev = monthDiff > -1;

    const daysInMonth = useMemo(() => {
        const start = startOfMonth(currentMonth);
        const end = endOfMonth(currentMonth);
        const days = eachDayOfInterval({ start, end });
        const startDayIndex = (getDay(start) + 1) % 7;
        const padding = Array.from({ length: startDayIndex }, () => null);
        return [...padding, ...days];
    }, [currentMonth]);

    const handleDateClick = (date: Date) => {
        setSelectedDateObj(date);
    };

    const selectedDateKey = selectedDateObj ? gFormat(selectedDateObj, 'yyyy-MM-dd') : null;
    const selectedDateSlots = selectedDateKey ? (slotsByDate[selectedDateKey] || []) : [];

    const handleCreateSlot = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedDateObj) {
            toast.error("لطفاً ابتدا یک روز را از تقویم انتخاب کنید.");
            return;
        }

        if (endTime <= startTime) {
            toast.error("ساعت پایان باید بعد از ساعت شروع باشد.");
            return;
        }

        setIsSubmitting(true);
        try {
            const dateStr = gFormat(selectedDateObj, 'yyyy-MM-dd');
            const start_at = `${dateStr}T${startTime}:00Z`;
            const end_at = `${dateStr}T${endTime}:00Z`;

            const res = await api.post('/admin/appointments/slots/', {
                date: dateStr,
                start_at: start_at,
                end_at: end_at
            });

            toast.success("بازه زمانی با موفقیت ایجاد شد.");

            const newSlot = res.data || { id: `temp-${Date.now()}`, date: dateStr, start_at: start_at, end_at: end_at, status: "AVAILABLE" };

            setSlotsByDate(prev => {
                const newMap = { ...prev };
                const existingSlots = newMap[dateStr] || [];
                newMap[dateStr] = [...existingSlots, newSlot].sort((a, b) => a.start_at.localeCompare(b.start_at));
                return newMap;
            });

        } catch (err: any) {
            console.error("❌ Backend Error Details:", err.response?.data);
            const errMsg = err.response?.data?.detail || "خطا در ایجاد بازه زمانی.";
            toast.error(errMsg);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteSlot = async (slotId: string | number) => {
        if (!selectedDateKey) return;
        
        setDeletingId(slotId);
        const prevSlots = slotsByDate;
        
        // Optimistic UI: حذف فوری از لیست
        setSlotsByDate(prev => {
            const newMap = { ...prev };
            if (newMap[selectedDateKey]) {
                newMap[selectedDateKey] = newMap[selectedDateKey].filter(s => s.id !== slotId);
            }
            return newMap;
        });

        try {
            await api.delete(`/admin/appointments/slots/${slotId}/`);
            toast.success("بازه زمانی حذف شد.");
        } catch (err: any) {
            setSlotsByDate(prevSlots); // بازگرداندن در صورت خطا
            const errMsg = err.response?.data?.detail || "خطا در حذف بازه زمانی. (امکان حذف بازه‌های رزرو شده وجود ندارد)";
            toast.error(errMsg);
        } finally {
            setDeletingId(null);
        }
    };

    return (
        <div className="w-full flex flex-col space-y-6">
            <h1 className="text-2xl font-bold text-gray-800 text-center md:text-right pt-16 md:pt-0">مدیریت زمان‌های نوبت‌دهی</h1>

            <div className="flex flex-col lg:flex-row gap-8 items-start">

                {/* ================= تقویم ================= */}
                <div className="w-full lg:w-[45%] bg-white rounded-[32px] p-6 shadow-sm border border-slate-100">
                    <div className="flex justify-between items-center mb-8 px-2">
                        <button onClick={() => canGoNext && setCurrentMonth(addMonths(currentMonth, 1))} disabled={!canGoNext} type="button" className="p-2 rounded-full hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                            <ChevronRight className="w-6 h-6 text-slate-700" />
                        </button>
                        <h3 className="text-xl font-bold text-slate-900">
                            {jFormat(currentMonth, 'MMMM yyyy')}
                        </h3>
                        <button onClick={() => canGoPrev && setCurrentMonth(subMonths(currentMonth, 1))} disabled={!canGoPrev} type="button" className="p-2 rounded-full hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
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
                            const isSelected = selectedDateObj ? isSameDay(date, selectedDateObj) : false;

                            let buttonStyle = "bg-white text-slate-700 hover:border-[#00D9FF] hover:border-2";
                            if (isSelected) buttonStyle = "border-2 border-[#2993A3] bg-cyan-50/50 text-slate-900 font-bold shadow-sm";
                            else if (isPast) buttonStyle = "text-slate-300 opacity-50 cursor-not-allowed";
                            else if (isFriday) buttonStyle = "bg-slate-100 text-red-500 border border-red-200 cursor-not-allowed";

                            return (
                                <div key={dateStr} className="relative group flex justify-center">
                                    <button
                                        type="button"
                                        onClick={() => !isPast && !isFriday && handleDateClick(date)}
                                        disabled={isPast || isFriday}
                                        className={`relative h-10 w-10 md:h-12 md:w-12 rounded-xl flex items-center justify-center text-sm md:text-base transition-all duration-200 ${buttonStyle}`}
                                    >
                                        {dayOfMonth}
                                        {hasSlots && !isSelected && (
                                            <span className="absolute bottom-1 right-1 w-1.5 h-1.5 bg-[#2993A3] rounded-full"></span>
                                        )}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* ================= فرم ساخت بازه و لیست اسلات‌ها ================= */}
                <div className="w-full lg:flex-1 bg-white rounded-[32px] p-6 shadow-sm border border-slate-100 min-h-[400px]">
                    {!selectedDateObj ? (
                        <div className="h-full flex items-center justify-center text-gray-400 text-center p-8">
                            <div>
                                <PlusCircle className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                                برای ایجاد بازه زمانی، یک روز را از تقویم انتخاب کنید.
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div>
                                <h3 className="text-lg font-bold text-gray-800">
                                    بازه‌های روز: {jFormat(selectedDateObj, 'd MMMM yyyy')}
                                </h3>
                                <p className="text-sm text-gray-500">ساعت‌های قابل رزرو برای این روز را تعیین کنید.</p>
                            </div>

                            <form onSubmit={handleCreateSlot} className="flex flex-col sm:flex-row gap-4 items-end bg-slate-50 p-4 rounded-2xl border border-slate-100">
                                <div className="flex-1 w-full">
                                    <label className="text-xs font-bold text-slate-600 block mb-1">ساعت شروع</label>
                                    <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="bg-white" required />
                                </div>
                                <div className="flex-1 w-full">
                                    <label className="text-xs font-bold text-slate-600 block mb-1">ساعت پایان</label>
                                    <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="bg-white" required />
                                </div>
                                <Button type="submit" disabled={isSubmitting} className="bg-[#2993A3] hover:bg-[#1f7b89] w-full sm:w-auto">
                                    {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "افزودن بازه"}
                                </Button>
                            </form>

                            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
                                {isLoadingSlots ? (
                                    <div className="text-center text-gray-400 py-4">در حال بارگذاری...</div>
                                ) : selectedDateSlots.length === 0 ? (
                                    <p className="text-center text-gray-400 py-8 text-sm">هیچ بازه‌ای برای این روز ثبت نشده است.</p>
                                ) : (
                                    selectedDateSlots.map((slot) => {
                                        const start = slot.start_at.slice(11, 16);
                                        const end = slot.end_at.slice(11, 16);
                                        const isBooked = slot.status !== "AVAILABLE" && slot.is_booked !== false;

                                        return (
                                            <div key={slot.id || slot.start_at} className={cn(
                                                "flex items-center justify-between p-3 rounded-xl border transition-all",
                                                isBooked ? "bg-green-50 border-green-100" : "bg-white border-slate-100 hover:border-red-200"
                                            )}>
                                                <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                                                    <Clock className="h-4 w-4 text-[#2993A3]" />
                                                    از {start} تا {end}
                                                </div>
                                                
                                                <div className="flex items-center gap-3">
                                                    <div className={cn(
                                                        "text-xs px-2 py-1 rounded-full",
                                                        isBooked ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"
                                                    )}>
                                                        {isBooked ? "رزرو شده" : "آزاد"}
                                                    </div>

                                                    {/* دکمه حذف اسلات */}
                                                    {!isBooked && (
                                                        <button 
                                                            onClick={() => handleDeleteSlot(slot.id)}
                                                            disabled={deletingId === slot.id}
                                                            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors disabled:opacity-50"
                                                            title="حذف بازه"
                                                        >
                                                            {deletingId === slot.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>

                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
