"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { getAppointments, getAppointmentsCalendar, rejectAppointmentApi } from "@/lib/appointments";
import AppointmentRow from "@/components/admin/appointments/appointment-row";
import RejectAppointmentModal from "@/components/admin/appointments/reject-appointment-modal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, ChevronLeft, ChevronRight, ArrowUp, ArrowDown } from "lucide-react";
import { Appointment, getAppointmentDate } from "@/lib/types";

// استفاده همزمان از date-fns برای parse کردن ISO بک‌اند و date-fns-jalali برای نمایش
import { format as gFormat, parseISO } from "date-fns";
import {
  format as jFormat,
  addMonths, subMonths,
  startOfMonth, endOfMonth,
  eachDayOfInterval, getDay,
  isSameDay, isToday
} from "date-fns-jalali";
import { cn } from "@/lib/utils";

// روزهای هفته شمسی
const WEEK_DAYS = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه'];

export default function AppointmentsPage() {
  const [activeTab, setActiveTab] = useState<"list" | "calendar">("list");
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [sortBy, setSortBy] = useState<"created_at" | "start_at" | "time">("start_at");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [dayFilter, setDayFilter] = useState<string>("all");

  const [rejectTarget, setRejectTarget] = useState<Appointment | null>(null);

  // Calendar States
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [calendarData, setCalendarData] = useState<Record<string, Appointment[]>>({});
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<Date | null>(null);

  // Debounce Search
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedSearch(search), 500);
    return () => clearTimeout(handler);
  }, [search]);

  const fetchAppointments = useCallback(async () => {
    try {
      const data = await getAppointments({ search: debouncedSearch });
      setAppointments(data);
    } catch (err) {
      console.error(err);
    }
  }, [debouncedSearch]);

  useEffect(() => {
    if (activeTab === "list") fetchAppointments();
  }, [activeTab, fetchAppointments]);

  useEffect(() => {
    if (activeTab !== "calendar") return;
    const fetchCal = async () => {
      try {
        const monthStr = gFormat(currentMonth, "yyyy-MM");
        const data = await getAppointmentsCalendar(monthStr);
        setCalendarData(data);
      } catch (err) {
        console.error(err);
      }
    };
    fetchCal();
  }, [activeTab, currentMonth]);

  // استخراج تاریخ‌های یکتا برای فیلتر (به صورت شمسی برای نمایش)
  const uniqueDates = useMemo(() => {
    const dates = new Set(
      appointments
        .map(a => {
          const d = getAppointmentDate(a);
          return d ? jFormat(d, "yyyy-MM-dd") : null;
        })
        .filter((d): d is string => d !== null)
    );
    return Array.from(dates).sort();
  }, [appointments]);

  const processedAppointments = useMemo(() => {
    let filtered = appointments.filter(a => getAppointmentDate(a) !== null);

    if (dayFilter !== "all") {
      filtered = filtered.filter(a => {
        const d = getAppointmentDate(a);
        return d && jFormat(d, "yyyy-MM-dd") === dayFilter;
      });
    }

    const dir = order === "desc" ? -1 : 1;

    if (sortBy === "created_at") {
      filtered.sort((a, b) => dir * (new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()));
    } else if (sortBy === "start_at") {
      filtered.sort((a, b) => dir * ((getAppointmentDate(a)?.getTime() || 0) - (getAppointmentDate(b)?.getTime() || 0)));
    } else if (sortBy === "time") {
      filtered.sort((a, b) => {
        const timeA = gFormat(getAppointmentDate(a)!, "HH:mm");
        const timeB = gFormat(getAppointmentDate(b)!, "HH:mm");
        return dir * timeA.localeCompare(timeB);
      });
    }

    if (sortBy === "start_at") {
      const grouped: Record<string, Appointment[]> = {};
      filtered.forEach(a => {
        const d = getAppointmentDate(a)!;
        const dateKey = jFormat(d, "yyyy-MM-dd");
        if (!grouped[dateKey]) grouped[dateKey] = [];
        grouped[dateKey].push(a);
      });
      return grouped;
    }

    return { "همه نوبت‌ها": filtered };
  }, [appointments, dayFilter, sortBy, order]);

  const handleReject = async (notes: string) => {
    if (!rejectTarget) return;
    const id = rejectTarget.id;
    const prev = appointments;

    setAppointments(prev => prev.map(a => a.id === id ? { ...a, status: "REJECTED", admin_notes: notes } : a));
    setCalendarData(prev => {
      const newData = { ...prev };
      for (const date in newData) {
        newData[date] = newData[date].map(a => a.id === id ? { ...a, status: "REJECTED", admin_notes: notes } : a);
      }
      return newData;
    });

    setRejectTarget(null);

    try {
      await rejectAppointmentApi(id, notes);
    } catch (err) {
      setAppointments(prev);
      console.error(err);
    }
  };

  // Calendar Helpers
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startDayIndex = (getDay(monthStart) + 1) % 7;

  const MAX_APPOINTMENTS_PER_DAY = 8;
  const OrderIcon = order === "desc" ? ArrowDown : ArrowUp;

  return (
    <div className="w-full min-h-full bg-white p-4 md:p-8 rounded-2xl flex flex-col space-y-6">
      <h1 className="text-xl md:text-2xl font-bold text-gray-800">لیست رزرو کاربران</h1>

      <div className="flex gap-2 bg-[#D4ECF3] p-1 rounded-xl w-full">
        <button
          onClick={() => setActiveTab("list")}
          className={cn("flex-1 px-6 py-2 rounded-lg text-sm font-medium transition-colors", activeTab === "list" ? "bg-white text-black shadow-sm" : "text-gray-600")}
        >
          نمایش به صورت لیست
        </button>
        <button
          onClick={() => setActiveTab("calendar")}
          className={cn("flex-1 px-6 py-2 rounded-lg text-sm font-medium transition-colors", activeTab === "calendar" ? "bg-white text-black shadow-sm" : "text-gray-600")}
        >
          نمایش به صورت تقویم
        </button>
      </div>

      {activeTab === "list" && (
        <>
          {/* First Row: Search & Filters - استفاده از grid برای ریسپانسیو شدن */}
          <div className="bg-white p-4 rounded-xl border border-gray-100 grid grid-cols-1 md:flex md:flex-row gap-4 md:items-center">
            <div className="relative w-full md:flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="جستجوی نام کاربری..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pr-10 bg-gray-50 border-gray-200 w-full"
              />
            </div>

            {/* Sort & Order Wrapper */}
            <div className="flex flex-col md:flex-row md:items-center gap-2 p-1 border rounded-lg w-full md:w-auto border-gray-200">
              <span className="text-xs text-gray-500 px-2 whitespace-nowrap">مرتب سازی:</span>
              <div className="flex gap-2 w-full">
                <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
                  <SelectTrigger className="flex-1 text-xs border-none bg-transparent focus:ring-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="text-xs">
                    <SelectItem className="text-xs" value="created_at">تاریخ رزرو نوبت</SelectItem>
                    <SelectItem className="text-xs" value="start_at">تاریخ نوبت</SelectItem>
                    <SelectItem className="text-xs" value="time">ساعت نوبت</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={order} onValueChange={(v) => setOrder(v as "asc" | "desc")}>
                  <SelectTrigger className="w-[90px] border-none bg-transparent focus:ring-0 text-xs">
                    <div className="flex items-center gap-1">
                      <OrderIcon className="h-4 w-4 text-[#2993A3]" />
                      <SelectValue />
                    </div>
                  </SelectTrigger>
                  <SelectContent className="text-xs">
                    <SelectItem className="text-xs" value="desc">نزولی</SelectItem>
                    <SelectItem className="text-xs" value="asc">صعودی</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Day Filter */}
            <div className={cn(
              "flex items-center gap-2 p-1 border rounded-lg w-full md:w-auto",
              dayFilter !== "all" ? "border-[#66D3F7] bg-[#F5FAFF]" : "border-gray-200"
            )}>
              <span className="text-xs text-gray-500 px-2 whitespace-nowrap">فیلتر روز:</span>
              <Select value={dayFilter} onValueChange={setDayFilter}>
                <SelectTrigger className="flex-1 text-xs border-none bg-transparent focus:ring-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="text-xs">
                  <SelectItem className="text-xs" value="all">همه روزها</SelectItem>
                  {uniqueDates.map(date => (
                    <SelectItem className="text-xs" key={date} value={date}>{date}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-6">
            {Object.keys(processedAppointments).length === 0 ? (
              <div className="text-center py-8 bg-white rounded-xl border border-gray-100 text-gray-400">
                نوبتی یافت نشد.
              </div>
            ) : (
              Object.entries(processedAppointments).map(([date, appts]) => (
                <div key={date}>
                  {sortBy === "start_at" && (
                    <h3 className="text-sm font-bold text-gray-500 mb-3 px-2">{date}</h3>
                  )}
                  <div className="space-y-3">
                    {appts.map(appt => (
                      <AppointmentRow
                        key={appt.id}
                        appointment={appt}
                        onReject={(id) => setRejectTarget(appts.find(a => a.id === id) || null)}
                      />
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {activeTab === "calendar" && (
        <div className="flex flex-col lg:flex-row gap-6">
          <div className="w-full lg:w-[45%] bg-white rounded-[32px] p-6 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.08)] border border-slate-100">
            <div className="flex justify-between items-center mb-8 px-2">
              <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-2 rounded-full hover:bg-slate-100 transition-colors">
                <ChevronRight className="w-6 h-6 text-slate-700" />
              </button>
              <h3 className="text-lg md:text-xl font-bold text-slate-900">
                {jFormat(currentMonth, "MMMM yyyy")}
              </h3>
              <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-2 rounded-full hover:bg-slate-100 transition-colors">
                <ChevronLeft className="w-6 h-6 text-slate-700" />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-2 mb-4 border-b border-slate-100 pb-4">
              {WEEK_DAYS.map(day => (
                <div key={day} className="text-center text-[9px] md:text-xs font-bold text-slate-400">{day}</div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-y-3 gap-x-2">
              {Array.from({ length: startDayIndex }).map((_, i) => (
                <div key={`empty-${i}`} className="h-10 w-10 md:h-12 md:w-12" />
              ))}

              {daysInMonth.map((date) => {
                const dateStr = gFormat(date, "yyyy-MM-dd");
                const dayAppts = calendarData[dateStr] || [];
                const isFriday = getDay(date) === 5;
                const percentage = Math.min(100, (dayAppts.length / MAX_APPOINTMENTS_PER_DAY) * 100);
                const isSelected = selectedCalendarDate && isSameDay(date, selectedCalendarDate);

                return (
                  <div key={dateStr} className="relative group flex justify-center">
                    <button
                      onClick={() => setSelectedCalendarDate(date)}
                      className="relative w-9 aspect-square h-9 md:h-12 md:w-12 rounded-full flex items-center justify-center transition-all duration-200"
                      style={{
                        background: dayAppts.length > 0 ? `conic-gradient(#2993A3 ${percentage}%, #E2E8F0 ${percentage}%)` : "transparent"
                      }}
                    >
                      <div className={cn(
                        "absolute w-7 aspect-square inset-1 rounded-full flex items-center justify-center text-sm font-medium transition-colors",
                        isSelected ? "bg-[#2993A3] text-white" : "bg-white text-slate-700 group-hover:bg-slate-50",
                        isFriday && "text-red-500",
                        isToday(date) && !isSelected && "border border-[#00D9FF]"
                      )}>
                        {jFormat(date, "d")}
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex-1 bg-white rounded-2xl p-6 border border-gray-100">
            {selectedCalendarDate ? (
              <>
                <h3 className="text-lg font-bold text-gray-800 mb-4">
                  نوبت‌های {jFormat(selectedCalendarDate, "yyyy-MM-dd")}
                </h3>
                <div className="space-y-3 max-h-[500px] overflow-y-auto pl-2">
                  {(calendarData[gFormat(selectedCalendarDate, "yyyy-MM-dd")] || []).map(appt => (
                    <AppointmentRow
                      key={appt.id}
                      appointment={appt}
                      onReject={(id) => setRejectTarget((calendarData[gFormat(selectedCalendarDate, "yyyy-MM-dd")] || []).find(a => a.id === id) || null)}
                    />
                  ))}
                  {(calendarData[gFormat(selectedCalendarDate, "yyyy-MM-dd")] || []).length === 0 && (
                    <p className="text-center text-gray-400 py-8">نوبتی برای این روز ثبت نشده است.</p>
                  )}
                </div>
              </>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-400">
                یک روز را برای مشاهده نوبت‌ها انتخاب کنید
              </div>
            )}
          </div>
        </div>
      )}

      <RejectAppointmentModal
        isOpen={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        onConfirm={handleReject}
        patientName={
          rejectTarget
            ? (() => {
              const user = (rejectTarget as any).user || (rejectTarget as any).patient || {};
              const name = `${user?.first_name || ""} ${user?.last_name || ""}`.trim();
              return name || "کاربر ناشناس";
            })()
            : ""
        }
      />
    </div>
  );
}