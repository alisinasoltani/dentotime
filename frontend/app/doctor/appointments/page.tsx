"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format as formatGregorian, parseISO } from "date-fns";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format as formatJalali,
  getDay,
  isToday,
  startOfMonth,
  subMonths,
} from "date-fns-jalali";
import {
  CalendarClock,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Loader2,
  Phone,
  RefreshCw,
  X,
} from "lucide-react";
import { toast } from "sonner";

import AvailabilityDialog from "@/components/doctor/availability-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  cancelDoctorAppointment,
  getDoctorAppointmentCalendar,
  getDoctorAppointments,
} from "@/lib/doctor-appointments";
import type { Appointment, DoctorCalendarDay } from "@/lib/types";
import { cn } from "@/lib/utils";


const weekDays = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنج‌شنبه", "جمعه"];
const statusLabels: Record<Appointment["status"], string> = {
  PENDING: "در انتظار تأیید",
  APPROVED: "تأیید شده",
  REJECTED: "رد شده",
  CANCELLED: "لغو شده",
  COMPLETED: "انجام شده",
  NO_SHOW: "عدم مراجعه",
};
const statusClasses: Record<Appointment["status"], string> = {
  PENDING: "bg-amber-50 text-amber-700",
  APPROVED: "bg-emerald-50 text-emerald-700",
  REJECTED: "bg-rose-50 text-rose-700",
  CANCELLED: "bg-slate-100 text-slate-600",
  COMPLETED: "bg-sky-50 text-sky-700",
  NO_SHOW: "bg-orange-50 text-orange-700",
};


function appointmentDate(appointment: Appointment) {
  const value = appointment.slot?.start_at || appointment.start_at;
  return value ? parseISO(value) : null;
}


function patientDetails(appointment: Appointment) {
  const firstName = appointment.patient?.first_name ?? appointment.contact_first_name ?? "";
  const lastName = appointment.patient?.last_name ?? appointment.contact_last_name ?? "";
  return {
    name: `${firstName} ${lastName}`.trim() || "مراجع مهمان",
    phone: appointment.patient?.phone_number ?? appointment.contact_phone_number ?? "",
    avatar: appointment.patient?.profile_picture || undefined,
  };
}


function initialDateFilter() {
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get("date");
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}


export default function DoctorAppointmentsPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [calendarDays, setCalendarDays] = useState<Record<string, DoctorCalendarDay>>({});
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [confirmingCancellation, setConfirmingCancellation] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isAvailabilityOpen, setIsAvailabilityOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [count, setCount] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrevious, setHasPrevious] = useState(false);
  const [loading, setLoading] = useState(true);
  const [calendarLoading, setCalendarLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fromUrl = initialDateFilter();
    if (!fromUrl) return;
    const timer = window.setTimeout(() => {
      setSelectedDate(fromUrl);
      setCurrentMonth(parseISO(fromUrl));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const { monthStart, monthEnd, daysInMonth, startDayIndex } = useMemo(() => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    return {
      monthStart: start,
      monthEnd: end,
      daysInMonth: eachDayOfInterval({ start, end }),
      startDayIndex: (getDay(start) + 1) % 7,
    };
  }, [currentMonth]);

  const loadAppointments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getDoctorAppointments(selectedDate || undefined, page);
      setAppointments(data.results);
      setCount(data.count);
      setHasNext(Boolean(data.next));
      setHasPrevious(Boolean(data.previous));
    } catch {
      setError("دریافت نوبت‌ها با خطا روبه‌رو شد. دوباره تلاش کنید.");
    } finally {
      setLoading(false);
    }
  }, [page, selectedDate]);

  const loadCalendar = useCallback(async () => {
    setCalendarLoading(true);
    try {
      const data = await getDoctorAppointmentCalendar(
        formatGregorian(monthStart, "yyyy-MM-dd"),
        formatGregorian(monthEnd, "yyyy-MM-dd"),
      );
      setCalendarDays(Object.fromEntries(data.days.map((day) => [day.date, day])));
    } catch {
      toast.error("دریافت اطلاعات تقویم ناموفق بود");
    } finally {
      setCalendarLoading(false);
    }
  }, [monthEnd, monthStart]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadAppointments(), 0);
    return () => window.clearTimeout(timer);
  }, [loadAppointments]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadCalendar(), 0);
    return () => window.clearTimeout(timer);
  }, [loadCalendar]);

  const setDateFilter = (date: string | null) => {
    setSelectedDate(date);
    setPage(1);
    const params = new URLSearchParams(window.location.search);
    if (date) params.set("date", date);
    else params.delete("date");
    const query = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
  };

  const showAppointmentsForDate = (date: string) => {
    setCurrentMonth(parseISO(date));
    setDateFilter(date);
  };

  const cancelAppointment = async () => {
    if (!selectedAppointment) return;
    setIsCancelling(true);
    try {
      const updated = await cancelDoctorAppointment(selectedAppointment.id);
      setSelectedAppointment(updated);
      setConfirmingCancellation(false);
      toast.success("نوبت با موفقیت لغو شد");
      await Promise.all([loadAppointments(), loadCalendar()]);
    } catch {
      toast.error("لغو این نوبت امکان‌پذیر نیست");
    } finally {
      setIsCancelling(false);
    }
  };

  const selectedDateLabel = useMemo(
    () => selectedDate ? formatJalali(parseISO(selectedDate), "EEEE d MMMM yyyy") : null,
    [selectedDate],
  );

  return (
    <div className="min-h-full space-y-6 p-4 md:p-8" dir="rtl">
      <header className="flex flex-col justify-between gap-4 rounded-3xl bg-gradient-to-l from-[#247F8D] to-[#58B4BE] p-6 text-white shadow-sm sm:flex-row sm:items-center md:p-8">
        <div className="flex items-center gap-3">
          <CalendarDays className="size-7" />
          <div>
            <h1 className="text-2xl font-black">نوبت‌های من</h1>
            <p className="mt-1 text-sm text-white/85">تقویم رزروها و برنامه نوبت‌دهی مطب</p>
          </div>
        </div>
        <Button type="button" size="lg" onClick={() => setIsAvailabilityOpen(true)} className="bg-white font-black text-[#247F8D] shadow-sm hover:bg-white/90">
          <CalendarClock /> تنظیم بازه های نوبت دهی
        </Button>
      </header>

      <div className="grid min-h-[620px] gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)]">
        <section className="order-2 flex min-h-0 flex-col rounded-3xl border border-slate-100 bg-white p-5 shadow-sm lg:order-1">
          <div className="mb-4 flex min-h-9 flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-black text-slate-900">فهرست نوبت‌ها</h2>
              <p className="mt-1 text-xs text-slate-500">{count.toLocaleString("fa-IR")} نوبت</p>
            </div>
            {selectedDate ? (
              <Badge className="h-8 gap-2 bg-[#EAF6F8] px-3 text-[#247F8D]">
                {selectedDateLabel}
                <button type="button" aria-label="حذف فیلتر تاریخ" onClick={() => setDateFilter(null)} className="rounded-full p-0.5 hover:bg-white"><X className="size-3.5" /></button>
              </Badge>
            ) : null}
          </div>

          {loading ? (
            <div className="flex min-h-80 items-center justify-center"><Loader2 className="size-7 animate-spin text-[#2993A3]" /></div>
          ) : error ? (
            <div className="flex min-h-80 flex-col items-center justify-center gap-4 text-center">
              <p className="font-bold text-rose-600">{error}</p>
              <Button type="button" onClick={() => void loadAppointments()}><RefreshCw /> تلاش دوباره</Button>
            </div>
          ) : appointments.length === 0 ? (
            <div className="flex min-h-80 items-center justify-center rounded-2xl border border-dashed border-slate-200 p-8 text-center text-slate-500">
              {selectedDate ? "نوبتی برای این روز وجود ندارد" : "هنوز نوبتی برای شما ثبت نشده است."}
            </div>
          ) : (
            <div className="space-y-3">
              {appointments.map((appointment) => {
                const date = appointmentDate(appointment);
                const dateKey = date ? formatGregorian(date, "yyyy-MM-dd") : "";
                const patient = patientDetails(appointment);
                return (
                  <button
                    key={appointment.id}
                    type="button"
                    onMouseEnter={() => setHoveredDate(dateKey)}
                    onMouseLeave={() => setHoveredDate(null)}
                    onFocus={() => setHoveredDate(dateKey)}
                    onBlur={() => setHoveredDate(null)}
                    onClick={() => { setSelectedAppointment(appointment); setConfirmingCancellation(false); }}
                    className="flex w-full items-center gap-3 rounded-2xl border border-slate-100 p-4 text-right transition-all hover:-translate-y-0.5 hover:border-[#B8E0E5] hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2993A3]"
                  >
                    <Avatar className="size-11 shrink-0">
                      <AvatarImage src={patient.avatar} alt={patient.name} />
                      <AvatarFallback className="bg-[#EAF6F8] font-black text-[#247F8D]">{patient.name[0]}</AvatarFallback>
                    </Avatar>
                    <span className="min-w-0 flex-1">
                      <strong className="block truncate text-sm text-slate-900">{patient.name}</strong>
                      <span className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                        <span className="flex items-center gap-1"><CalendarDays className="size-3.5" />{date ? formatJalali(date, "d MMMM yyyy") : "نامشخص"}</span>
                        <span className="flex items-center gap-1"><Clock3 className="size-3.5" />{date ? formatGregorian(date, "HH:mm") : "--:--"}</span>
                      </span>
                    </span>
                    <Badge className={cn("border-0", statusClasses[appointment.status])}>{statusLabels[appointment.status]}</Badge>
                  </button>
                );
              })}
            </div>
          )}

          {!loading && (hasNext || hasPrevious) ? (
            <nav className="mt-auto flex items-center justify-center gap-3 border-t border-slate-100 pt-5" aria-label="صفحه‌بندی نوبت‌ها">
              <Button type="button" variant="outline" size="sm" disabled={!hasPrevious} onClick={() => setPage((current) => Math.max(1, current - 1))}>قبلی</Button>
              <span className="text-xs font-bold text-slate-500">صفحه {page.toLocaleString("fa-IR")}</span>
              <Button type="button" variant="outline" size="sm" disabled={!hasNext} onClick={() => setPage((current) => current + 1)}>بعدی</Button>
            </nav>
          ) : null}
        </section>

        <section className="order-1 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm lg:order-2">
          <div className="mb-5 flex items-center justify-between">
            <Button type="button" size="icon-sm" variant="ghost" aria-label="ماه بعد" onClick={() => setCurrentMonth((month) => addMonths(month, 1))}><ChevronRight /></Button>
            <h2 className="font-black text-slate-900">{formatJalali(currentMonth, "MMMM yyyy")}</h2>
            <Button type="button" size="icon-sm" variant="ghost" aria-label="ماه قبل" onClick={() => setCurrentMonth((month) => subMonths(month, 1))}><ChevronLeft /></Button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center">
            {weekDays.map((day) => <span key={day} className="py-2 text-[10px] font-black text-slate-400 sm:text-xs">{day}</span>)}
            {Array.from({ length: startDayIndex }).map((_, index) => <span key={`empty-${index}`} />)}
            {daysInMonth.map((day) => {
              const key = formatGregorian(day, "yyyy-MM-dd");
              const summary = calendarDays[key];
              const isSelected = selectedDate === key;
              const isHovered = hoveredDate === key;
              return (
                <button
                  type="button"
                  key={key}
                  data-date={key}
                  aria-label={`${formatJalali(day, "d MMMM yyyy")}${summary?.total ? `، ${summary.total.toLocaleString("fa-IR")} نوبت` : "، بدون نوبت"}`}
                  onClick={() => setDateFilter(key)}
                  className={cn(
                    "relative flex aspect-square min-h-10 flex-col items-center justify-center rounded-xl border border-transparent text-sm font-bold transition-all hover:border-[#8BCDD4] hover:bg-[#F1FAFB]",
                    isToday(day) && "text-[#247F8D] ring-1 ring-[#B8E0E5]",
                    isSelected && "border-[#2993A3] bg-[#2993A3] text-white shadow-sm",
                    isHovered && !isSelected && "border-amber-300 bg-amber-50 ring-2 ring-amber-200",
                  )}
                >
                  <span>{formatJalali(day, "d")}</span>
                  {summary?.total ? <span className={cn("mt-1 size-1.5 rounded-full bg-[#2993A3]", isSelected && "bg-white")} /> : null}
                  {summary?.total ? <span className="sr-only">{summary.total} نوبت</span> : null}
                </button>
              );
            })}
          </div>
          {calendarLoading ? <p className="mt-4 flex items-center justify-center gap-2 text-xs text-slate-400"><Loader2 className="size-3.5 animate-spin" /> در حال بروزرسانی تقویم</p> : null}
        </section>
      </div>

      <Dialog open={Boolean(selectedAppointment)} onOpenChange={(open) => !open && setSelectedAppointment(null)}>
        <DialogContent dir="rtl" className="rounded-3xl text-right sm:max-w-md">
          {selectedAppointment ? (() => {
            const patient = patientDetails(selectedAppointment);
            const date = appointmentDate(selectedAppointment);
            return (
              <>
                <DialogHeader className="text-right"><DialogTitle className="text-xl font-black">مشخصات مراجع</DialogTitle><DialogDescription>اطلاعات تماس و جزئیات نوبت انتخاب‌شده</DialogDescription></DialogHeader>
                <div className="flex items-center gap-4 rounded-2xl bg-slate-50 p-4">
                  <Avatar className="size-16"><AvatarImage src={patient.avatar} alt={patient.name} /><AvatarFallback className="bg-[#EAF6F8] text-xl font-black text-[#247F8D]">{patient.name[0]}</AvatarFallback></Avatar>
                  <div className="min-w-0 flex-1"><h3 className="truncate font-black text-slate-900">{patient.name}</h3>{patient.phone ? <a href={`tel:${patient.phone}`} dir="ltr" className="mt-2 flex items-center gap-2 text-sm text-[#247F8D]"><Phone className="size-4" />{patient.phone}</a> : null}</div>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-2xl border border-slate-100 p-3"><span className="block text-xs text-slate-500">تاریخ</span><strong className="mt-1 block">{date ? formatJalali(date, "d MMMM yyyy") : "نامشخص"}</strong></div>
                  <div className="rounded-2xl border border-slate-100 p-3"><span className="block text-xs text-slate-500">ساعت</span><strong className="mt-1 block">{date ? formatGregorian(date, "HH:mm") : "نامشخص"}</strong></div>
                </div>
                {selectedAppointment.reason ? <p className="rounded-2xl bg-slate-50 p-4 text-sm leading-7 text-slate-700"><strong>دلیل مراجعه: </strong>{selectedAppointment.reason}</p> : null}
                {confirmingCancellation ? (
                  <div className="space-y-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
                    <p className="font-bold">از لغو این نوبت مطمئن هستید؟ بازه زمانی دوباره آزاد خواهد شد.</p>
                    <div className="flex gap-2"><Button type="button" variant="destructive" disabled={isCancelling} onClick={() => void cancelAppointment()}>{isCancelling ? <Loader2 className="animate-spin" /> : null} تأیید لغو</Button><Button type="button" variant="outline" onClick={() => setConfirmingCancellation(false)}>انصراف</Button></div>
                  </div>
                ) : null}
                <DialogFooter className="bg-transparent">{selectedAppointment.can_cancel && !confirmingCancellation ? <Button type="button" variant="destructive" onClick={() => setConfirmingCancellation(true)}>لغو نوبت</Button> : null}</DialogFooter>
              </>
            );
          })() : null}
        </DialogContent>
      </Dialog>

      <AvailabilityDialog open={isAvailabilityOpen} onOpenChange={setIsAvailabilityOpen} onShowAppointments={showAppointmentsForDate} />
    </div>
  );
}
