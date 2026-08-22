"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { addDays, format as formatGregorian, parseISO } from "date-fns";
import { format as formatJalali } from "date-fns-jalali";
import { isAxiosError } from "axios";
import {
  ArrowLeft,
  CalendarClock,
  CalendarRange,
  Clock3,
  Loader2,
  Repeat2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createDoctorAvailability,
  deleteDoctorAvailabilityDay,
  deleteDoctorAvailabilitySlot,
  getDoctorAvailability,
} from "@/lib/doctor-appointments";
import type { DoctorAvailabilitySlot } from "@/lib/types";
import { cn } from "@/lib/utils";


const weekdays = [
  { value: 5, label: "شنبه" },
  { value: 6, label: "یکشنبه" },
  { value: 0, label: "دوشنبه" },
  { value: 1, label: "سه‌شنبه" },
  { value: 2, label: "چهارشنبه" },
  { value: 3, label: "پنج‌شنبه" },
  { value: 4, label: "جمعه" },
];


function dateInputValue(date: Date) {
  return formatGregorian(date, "yyyy-MM-dd");
}


function jalaliDate(value: string) {
  try {
    return formatJalali(parseISO(value), "yyyy/MM/dd");
  } catch {
    return value;
  }
}


function serverMessage(error: unknown, fallback: string) {
  if (!isAxiosError(error)) return fallback;
  const data = error.response?.data;
  if (typeof data?.detail === "string") return data.detail;
  const firstValue = data && typeof data === "object" ? Object.values(data)[0] : null;
  if (Array.isArray(firstValue)) return String(firstValue[0]);
  if (typeof firstValue === "string") return firstValue;
  return fallback;
}


interface RemovalConflict {
  detail: string;
  booked_count: number;
  date: string;
}


export default function AvailabilityDialog({
  open,
  onOpenChange,
  onShowAppointments,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onShowAppointments: (date: string) => void;
}) {
  const tomorrow = useMemo(() => addDays(new Date(), 1), []);
  const [mode, setMode] = useState<"recurring" | "single">("recurring");
  const [startDate, setStartDate] = useState(dateInputValue(tomorrow));
  const [endDate, setEndDate] = useState(dateInputValue(addDays(tomorrow, 55)));
  const [selectedWeekdays, setSelectedWeekdays] = useState<number[]>([5, 0, 2]);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("13:00");
  const [duration, setDuration] = useState("30");
  const [previewDate, setPreviewDate] = useState(dateInputValue(tomorrow));
  const [slots, setSlots] = useState<DoctorAvailabilitySlot[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [deletingId, setDeletingId] = useState<number | "day" | null>(null);
  const [conflict, setConflict] = useState<RemovalConflict | null>(null);

  const loadSlots = useCallback(async () => {
    if (!previewDate) return;
    setIsLoadingSlots(true);
    try {
      const data = await getDoctorAvailability(previewDate);
      setSlots(data.slots);
    } catch {
      toast.error("دریافت بازه‌های این روز ناموفق بود");
    } finally {
      setIsLoadingSlots(false);
    }
  }, [previewDate]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => void loadSlots(), 0);
    return () => window.clearTimeout(timer);
  }, [loadSlots, open]);

  const toggleWeekday = (weekday: number) => {
    setSelectedWeekdays((current) =>
      current.includes(weekday)
        ? current.filter((item) => item !== weekday)
        : [...current, weekday],
    );
  };

  const saveAvailability = async () => {
    const singleWeekday = (parseISO(startDate).getDay() + 6) % 7;
    const selected = mode === "single" ? [singleWeekday] : selectedWeekdays;
    if (!selected.length) {
      toast.error("حداقل یک روز هفته را انتخاب کنید");
      return;
    }
    if (startDate > endDate) {
      toast.error("تاریخ پایان باید بعد از تاریخ شروع باشد");
      return;
    }

    setIsSaving(true);
    try {
      const result = await createDoctorAvailability({
        start_date: startDate,
        end_date: mode === "single" ? startDate : endDate,
        weekdays: selected,
        start_time: startTime,
        end_time: endTime,
        slot_duration_minutes: Number(duration),
        save_as_routine: mode === "recurring",
      });
      setPreviewDate(startDate);
      toast.success(
        `${(result.created + result.restored).toLocaleString("fa-IR")} بازه نوبت‌دهی آماده شد`,
      );
      window.setTimeout(() => void loadSlots(), 0);
    } catch (error) {
      toast.error(serverMessage(error, "ثبت بازه‌های نوبت‌دهی ناموفق بود"));
    } finally {
      setIsSaving(false);
    }
  };

  const captureConflict = (error: unknown) => {
    if (isAxiosError(error) && error.response?.status === 409) {
      const data = error.response.data as RemovalConflict;
      if (data?.date && data?.booked_count) {
        setConflict(data);
        return true;
      }
    }
    return false;
  };

  const deleteSlot = async (slot: DoctorAvailabilitySlot) => {
    setDeletingId(slot.id);
    setConflict(null);
    try {
      await deleteDoctorAvailabilitySlot(slot.id);
      await loadSlots();
      toast.success("بازه نوبت‌دهی حذف شد");
    } catch (error) {
      if (!captureConflict(error)) {
        toast.error(serverMessage(error, "حذف بازه ناموفق بود"));
      }
    } finally {
      setDeletingId(null);
    }
  };

  const deleteDay = async () => {
    if (!previewDate) return;
    setDeletingId("day");
    setConflict(null);
    try {
      await deleteDoctorAvailabilityDay(previewDate);
      await loadSlots();
      toast.success("تمام بازه‌های این روز حذف شدند");
    } catch (error) {
      if (!captureConflict(error)) {
        toast.error(serverMessage(error, "حذف بازه‌های این روز ناموفق بود"));
      }
    } finally {
      setDeletingId(null);
    }
  };

  const showConflictingAppointments = () => {
    if (!conflict) return;
    onOpenChange(false);
    onShowAppointments(conflict.date);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        dir="rtl"
        className="inset-2 top-2 left-2 grid h-[calc(100vh-1rem)] max-h-none w-[calc(100vw-1rem)] max-w-none translate-x-0 translate-y-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-3xl p-0 sm:max-w-none"
      >
        <DialogHeader className="border-b border-slate-100 px-6 py-5 text-right">
          <DialogTitle className="flex items-center gap-2 text-xl font-black text-slate-900">
            <CalendarClock className="size-6 text-[#2993A3]" />
            تنظیم بازه‌های نوبت دهی
          </DialogTitle>
          <DialogDescription>
            یک روز خاص یا برنامه هفتگی تکرارشونده تعریف کنید و نتیجه را پیش از خروج بررسی کنید.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="min-h-0">
          <div className="grid min-h-full gap-6 bg-[#F7FAFB] p-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)] lg:p-8">
            <section className="space-y-6 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm lg:p-7">
              <div className="flex rounded-2xl bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => setMode("recurring")}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-black",
                    mode === "recurring" ? "bg-white text-[#247F8D] shadow-sm" : "text-slate-500",
                  )}
                >
                  <Repeat2 className="size-4" /> برنامه تکرارشونده
                </button>
                <button
                  type="button"
                  onClick={() => setMode("single")}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-black",
                    mode === "single" ? "bg-white text-[#247F8D] shadow-sm" : "text-slate-500",
                  )}
                >
                  <CalendarRange className="size-4" /> فقط یک روز
                </button>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-2 text-sm font-bold text-slate-700">
                  <span>{mode === "single" ? "تاریخ نوبت‌دهی" : "شروع برنامه"}</span>
                  <Input
                    type="date"
                    min={dateInputValue(new Date())}
                    value={startDate}
                    onChange={(event) => {
                      setStartDate(event.target.value);
                      if (mode === "single") setPreviewDate(event.target.value);
                    }}
                    className="h-11"
                  />
                  <small className="block font-normal text-slate-500">
                    {jalaliDate(startDate)} شمسی
                  </small>
                </label>
                {mode === "recurring" ? (
                  <label className="space-y-2 text-sm font-bold text-slate-700">
                    <span>پایان برنامه (حداکثر ۶۲ روز)</span>
                    <Input
                      type="date"
                      min={startDate}
                      max={dateInputValue(addDays(parseISO(startDate), 61))}
                      value={endDate}
                      onChange={(event) => setEndDate(event.target.value)}
                      className="h-11"
                    />
                    <small className="block font-normal text-slate-500">
                      {jalaliDate(endDate)} شمسی
                    </small>
                  </label>
                ) : null}
              </div>

              {mode === "recurring" ? (
                <fieldset className="space-y-3">
                  <legend className="text-sm font-black text-slate-700">روزهای تکرار</legend>
                  <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                    {weekdays.map((weekday) => (
                      <button
                        key={weekday.value}
                        type="button"
                        aria-pressed={selectedWeekdays.includes(weekday.value)}
                        onClick={() => toggleWeekday(weekday.value)}
                        className={cn(
                          "rounded-xl border px-2 py-3 text-xs font-black transition-colors",
                          selectedWeekdays.includes(weekday.value)
                            ? "border-[#2993A3] bg-[#EAF6F8] text-[#247F8D]"
                            : "border-slate-200 bg-white text-slate-500 hover:border-slate-300",
                        )}
                      >
                        {weekday.label}
                      </button>
                    ))}
                  </div>
                </fieldset>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-3">
                <label className="space-y-2 text-sm font-bold text-slate-700">
                  <span>از ساعت</span>
                  <Input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} className="h-11" />
                </label>
                <label className="space-y-2 text-sm font-bold text-slate-700">
                  <span>تا ساعت</span>
                  <Input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} className="h-11" />
                </label>
                <label className="space-y-2 text-sm font-bold text-slate-700">
                  <span>مدت هر نوبت</span>
                  <Select value={duration} onValueChange={setDuration}>
                    <SelectTrigger className="h-11 w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[15, 20, 30, 45, 60, 90].map((minutes) => (
                        <SelectItem key={minutes} value={String(minutes)}>{minutes.toLocaleString("fa-IR")} دقیقه</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
              </div>

              <Button
                type="button"
                size="lg"
                disabled={isSaving}
                onClick={() => void saveAvailability()}
                className="w-full bg-[#2993A3] font-black text-white hover:bg-[#227D8A]"
              >
                {isSaving ? <Loader2 className="animate-spin" /> : <CalendarClock />}
                {mode === "recurring" ? "ثبت برنامه و ساخت نوبت‌ها" : "ساخت نوبت‌های این روز"}
              </Button>
            </section>

            <section className="space-y-4 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm lg:p-7">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <label className="space-y-2 text-sm font-bold text-slate-700">
                  <span>پیش‌نمایش روز</span>
                  <Input type="date" value={previewDate} onChange={(event) => setPreviewDate(event.target.value)} className="h-10" />
                </label>
                <Badge variant="secondary" className="h-8 bg-[#EAF6F8] px-3 text-[#247F8D]">
                  {jalaliDate(previewDate)}
                </Badge>
              </div>

              {conflict ? (
                <div role="alert" className="space-y-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm leading-7 text-rose-800">
                  <p className="font-bold">{conflict.detail}</p>
                  <Button type="button" variant="outline" onClick={showConflictingAppointments} className="w-full border-rose-200 bg-white text-rose-700">
                    مشاهده نوبت‌های این تاریخ <ArrowLeft />
                  </Button>
                </div>
              ) : null}

              <div className="flex items-center justify-between">
                <h3 className="font-black text-slate-900">بازه‌های ساخته‌شده</h3>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!slots.length || deletingId !== null}
                  onClick={() => void deleteDay()}
                  className="border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                >
                  {deletingId === "day" ? <Loader2 className="animate-spin" /> : <Trash2 />}
                  حذف تمام روز
                </Button>
              </div>

              {isLoadingSlots ? (
                <div className="flex min-h-48 items-center justify-center"><Loader2 className="size-6 animate-spin text-[#2993A3]" /></div>
              ) : slots.length ? (
                <div className="space-y-2">
                  {slots.map((slot) => (
                    <div key={slot.id} className="flex items-center gap-3 rounded-2xl border border-slate-100 p-3">
                      <Clock3 className="size-4 text-[#2993A3]" />
                      <span className="flex-1 text-sm font-black text-slate-700" dir="ltr">
                        {formatGregorian(parseISO(slot.start_at), "HH:mm")} – {formatGregorian(parseISO(slot.end_at), "HH:mm")}
                      </span>
                      <Badge variant="secondary" className={cn(slot.status === "BOOKED" ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700")}>
                        {slot.status === "BOOKED" ? "رزرو شده" : slot.status === "BLOCKED" ? "غیرفعال" : "آزاد"}
                      </Badge>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        disabled={deletingId !== null}
                        onClick={() => void deleteSlot(slot)}
                        aria-label={`حذف بازه ${formatGregorian(parseISO(slot.start_at), "HH:mm")}`}
                        className="rounded-full text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                      >
                        {deletingId === slot.id ? <Loader2 className="animate-spin" /> : <Trash2 />}
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="rounded-2xl border border-dashed border-slate-200 p-10 text-center text-sm text-slate-500">
                  برای این روز بازه‌ای تعریف نشده است.
                </p>
              )}
            </section>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
