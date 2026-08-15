"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import type { AxiosResponse } from "axios";
import { CalendarSync, Loader2, Plus, Power, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import api from "@/lib/api";

interface Page<T> {
  results: T[];
  next: string | null;
}

interface WeeklyRule {
  id: number;
  weekday: number;
  start_time: string;
  end_time: string;
  slot_duration_minutes: number;
  capacity: number;
  is_active: boolean;
}

interface ScheduleBreak {
  id: number;
  rule: number;
  start_time: string;
  end_time: string;
}

interface ScheduleOverride {
  id: number;
  date: string;
  kind: "CLOSED" | "CUSTOM";
  start_time: string | null;
  end_time: string | null;
  slot_duration_minutes: number | null;
  capacity: number | null;
}

const DAYS = [
  { value: 5, label: "شنبه" },
  { value: 6, label: "یکشنبه" },
  { value: 0, label: "دوشنبه" },
  { value: 1, label: "سه‌شنبه" },
  { value: 2, label: "چهارشنبه" },
  { value: 3, label: "پنج‌شنبه" },
  { value: 4, label: "جمعه" },
] as const;

function apiPath(url: string): string {
  const parsed = new URL(url);
  return `${parsed.pathname.replace(/^\/api\/v1/, "")}${parsed.search}`;
}

async function fetchAll<T>(initialUrl: string): Promise<T[]> {
  const items: T[] = [];
  let url: string | null = initialUrl;
  while (url) {
    const response: AxiosResponse<T[] | Page<T>> = await api.get<T[] | Page<T>>(url);
    if (Array.isArray(response.data)) return [...items, ...response.data];
    items.push(...response.data.results);
    url = response.data.next ? apiPath(response.data.next) : null;
  }
  return items;
}

function errorMessage(error: unknown, fallback: string): string {
  if (!axios.isAxiosError(error)) return fallback;
  const data = error.response?.data as { detail?: string; non_field_errors?: string[] } | undefined;
  return data?.detail ?? data?.non_field_errors?.[0] ?? fallback;
}

function tehranDate(offsetDays = 0): string {
  const date = new Date(Date.now() + offsetDays * 86_400_000);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function timeLabel(value: string | null): string {
  return value?.slice(0, 5) ?? "—";
}

export function AvailabilityManager({ onGenerated }: { onGenerated: () => void }) {
  const [rules, setRules] = useState<WeeklyRule[]>([]);
  const [breaks, setBreaks] = useState<ScheduleBreak[]>([]);
  const [overrides, setOverrides] = useState<ScheduleOverride[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const [weekday, setWeekday] = useState("5");
  const [ruleStart, setRuleStart] = useState("09:00");
  const [ruleEnd, setRuleEnd] = useState("17:00");
  const [duration, setDuration] = useState("30");
  const [capacity, setCapacity] = useState("1");

  const [breakRule, setBreakRule] = useState("");
  const [breakStart, setBreakStart] = useState("13:00");
  const [breakEnd, setBreakEnd] = useState("14:00");

  const [overrideDate, setOverrideDate] = useState(tehranDate(1));
  const [overrideKind, setOverrideKind] = useState<"CLOSED" | "CUSTOM">("CLOSED");
  const [overrideStart, setOverrideStart] = useState("09:00");
  const [overrideEnd, setOverrideEnd] = useState("13:00");

  const [rangeStart, setRangeStart] = useState(tehranDate());
  const [rangeEnd, setRangeEnd] = useState(tehranDate(30));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nextRules, nextBreaks, nextOverrides] = await Promise.all([
        fetchAll<WeeklyRule>("/admin/appointments/availability/rules/"),
        fetchAll<ScheduleBreak>("/admin/appointments/availability/breaks/"),
        fetchAll<ScheduleOverride>("/admin/appointments/availability/overrides/"),
      ]);
      setRules(nextRules);
      setBreaks(nextBreaks);
      setOverrides(nextOverrides);
      setBreakRule((current) => current || String(nextRules[0]?.id ?? ""));
    } catch (error) {
      toast.error(errorMessage(error, "دریافت برنامه کاری ناموفق بود."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const dayName = useMemo(
    () => new Map<number, string>(DAYS.map((day) => [day.value, day.label])),
    [],
  );

  async function addRule(event: React.FormEvent) {
    event.preventDefault();
    setBusy("rule-create");
    try {
      await api.post("/admin/appointments/availability/rules/", {
        weekday: Number(weekday),
        start_time: ruleStart,
        end_time: ruleEnd,
        slot_duration_minutes: Number(duration),
        capacity: Number(capacity),
        is_active: true,
      });
      toast.success("ساعات کاری هفتگی ذخیره شد.");
      await load();
    } catch (error) {
      toast.error(errorMessage(error, "ذخیره ساعات کاری ناموفق بود."));
    } finally {
      setBusy(null);
    }
  }

  async function addBreak(event: React.FormEvent) {
    event.preventDefault();
    if (!breakRule) return;
    setBusy("break-create");
    try {
      await api.post("/admin/appointments/availability/breaks/", {
        rule: Number(breakRule),
        start_time: breakStart,
        end_time: breakEnd,
      });
      toast.success("زمان استراحت ذخیره شد.");
      await load();
    } catch (error) {
      toast.error(errorMessage(error, "ذخیره زمان استراحت ناموفق بود."));
    } finally {
      setBusy(null);
    }
  }

  async function addOverride(event: React.FormEvent) {
    event.preventDefault();
    setBusy("override-create");
    try {
      await api.post("/admin/appointments/availability/overrides/", {
        date: overrideDate,
        kind: overrideKind,
        ...(overrideKind === "CUSTOM"
          ? {
              start_time: overrideStart,
              end_time: overrideEnd,
              slot_duration_minutes: Number(duration),
              capacity: Number(capacity),
            }
          : {}),
      });
      toast.success("استثنای تقویم ذخیره شد.");
      await load();
    } catch (error) {
      toast.error(errorMessage(error, "ذخیره استثنای تقویم ناموفق بود."));
    } finally {
      setBusy(null);
    }
  }

  async function remove(path: string, key: string, success: string) {
    setBusy(key);
    try {
      await api.delete(path);
      toast.success(success);
      await load();
    } catch (error) {
      toast.error(errorMessage(error, "حذف مورد ناموفق بود."));
    } finally {
      setBusy(null);
    }
  }

  async function toggleRule(rule: WeeklyRule) {
    setBusy(`rule-toggle-${rule.id}`);
    try {
      await api.patch(`/admin/appointments/availability/rules/${rule.id}/`, {
        is_active: !rule.is_active,
      });
      await load();
    } catch (error) {
      toast.error(errorMessage(error, "تغییر وضعیت برنامه ناموفق بود."));
    } finally {
      setBusy(null);
    }
  }

  async function generate(event: React.FormEvent) {
    event.preventDefault();
    setBusy("generate");
    try {
      const response = await api.post<{
        created: number;
        updated: number;
        removed: number;
        total: number;
      }>("/admin/appointments/availability/generate/", {
        start_date: rangeStart,
        end_date: rangeEnd,
      });
      toast.success(
        `تقویم ساخته شد: ${response.data.created} بازه جدید، ${response.data.total} بازه فعال.`,
      );
      onGenerated();
    } catch (error) {
      toast.error(errorMessage(error, "ساخت تقویم نوبت‌دهی ناموفق بود."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-5 rounded-[32px] border border-slate-100 bg-white p-5 shadow-sm md:p-7" dir="rtl">
      <div>
        <h2 className="text-xl font-bold text-slate-900">برنامه کاری کلینیک</h2>
        <p className="mt-1 text-sm text-slate-500">
          ساعات هفتگی، استراحت‌ها و تعطیلی‌ها بر اساس منطقه زمانی تهران محاسبه می‌شوند.
        </p>
      </div>

      {loading ? (
        <div className="flex min-h-36 items-center justify-center text-slate-400">
          <Loader2 className="size-6 animate-spin" aria-label="در حال بارگذاری" />
        </div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          <div className="space-y-4 rounded-2xl border border-slate-100 p-4">
            <h3 className="font-bold text-slate-800">ساعات هفتگی</h3>
            <form onSubmit={addRule} className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <div className="col-span-2 md:col-span-1">
                <Label className="mb-1">روز</Label>
                <Select value={weekday} onValueChange={setWeekday}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>{DAYS.map((day) => <SelectItem key={day.value} value={String(day.value)}>{day.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label className="mb-1">شروع</Label><Input type="time" value={ruleStart} onChange={(event) => setRuleStart(event.target.value)} required /></div>
              <div><Label className="mb-1">پایان</Label><Input type="time" value={ruleEnd} onChange={(event) => setRuleEnd(event.target.value)} required /></div>
              <div><Label className="mb-1">مدت نوبت</Label><Input type="number" min="5" max="480" value={duration} onChange={(event) => setDuration(event.target.value)} required /></div>
              <div><Label className="mb-1">ظرفیت</Label><Input type="number" min="1" max="20" value={capacity} onChange={(event) => setCapacity(event.target.value)} required /></div>
              <Button className="col-span-2 md:col-span-5" disabled={busy !== null} type="submit"><Plus className="size-4" /> افزودن ساعت کاری</Button>
            </form>
            <div className="space-y-2">
              {rules.length === 0 && <p className="text-sm text-slate-400">هنوز برنامه هفتگی ثبت نشده است.</p>}
              {rules.map((rule) => (
                <div key={rule.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 p-3 text-sm">
                  <span className={rule.is_active ? "text-slate-800" : "text-slate-400 line-through"}>
                    {dayName.get(rule.weekday)}، {timeLabel(rule.start_time)} تا {timeLabel(rule.end_time)} · هر {rule.slot_duration_minutes} دقیقه · ظرفیت {rule.capacity}
                  </span>
                  <div className="flex gap-1">
                    <Button type="button" size="icon" variant="ghost" aria-label={rule.is_active ? "غیرفعال کردن" : "فعال کردن"} disabled={busy !== null} onClick={() => void toggleRule(rule)}><Power className="size-4" /></Button>
                    <Button type="button" size="icon" variant="ghost" aria-label="حذف ساعت کاری" disabled={busy !== null} onClick={() => void remove(`/admin/appointments/availability/rules/${rule.id}/`, `rule-${rule.id}`, "ساعت کاری حذف شد.")}><Trash2 className="size-4 text-red-500" /></Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4 rounded-2xl border border-slate-100 p-4">
            <h3 className="font-bold text-slate-800">زمان‌های استراحت</h3>
            <form onSubmit={addBreak} className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><Label className="mb-1">برنامه کاری</Label><Select value={breakRule} onValueChange={setBreakRule} disabled={rules.length === 0}><SelectTrigger className="w-full"><SelectValue placeholder="انتخاب برنامه" /></SelectTrigger><SelectContent>{rules.map((rule) => <SelectItem key={rule.id} value={String(rule.id)}>{dayName.get(rule.weekday)}، {timeLabel(rule.start_time)} تا {timeLabel(rule.end_time)}</SelectItem>)}</SelectContent></Select></div>
              <div><Label className="mb-1">شروع</Label><Input type="time" value={breakStart} onChange={(event) => setBreakStart(event.target.value)} required /></div>
              <div><Label className="mb-1">پایان</Label><Input type="time" value={breakEnd} onChange={(event) => setBreakEnd(event.target.value)} required /></div>
              <Button className="col-span-2" disabled={busy !== null || !breakRule} type="submit"><Plus className="size-4" /> افزودن زمان استراحت</Button>
            </form>
            <div className="space-y-2">
              {breaks.length === 0 && <p className="text-sm text-slate-400">زمان استراحتی ثبت نشده است.</p>}
              {breaks.map((item) => {
                const rule = rules.find((candidate) => candidate.id === item.rule);
                return <div key={item.id} className="flex items-center justify-between rounded-xl bg-slate-50 p-3 text-sm"><span>{rule ? dayName.get(rule.weekday) : "برنامه حذف‌شده"}، {timeLabel(item.start_time)} تا {timeLabel(item.end_time)}</span><Button type="button" size="icon" variant="ghost" aria-label="حذف زمان استراحت" disabled={busy !== null} onClick={() => void remove(`/admin/appointments/availability/breaks/${item.id}/`, `break-${item.id}`, "زمان استراحت حذف شد.")}><Trash2 className="size-4 text-red-500" /></Button></div>;
              })}
            </div>
          </div>

          <div className="space-y-4 rounded-2xl border border-slate-100 p-4">
            <h3 className="font-bold text-slate-800">تعطیلی یا ساعت ویژه</h3>
            <form onSubmit={addOverride} className="grid grid-cols-2 gap-3">
              <div><Label className="mb-1">تاریخ</Label><Input type="date" min={tehranDate()} value={overrideDate} onChange={(event) => setOverrideDate(event.target.value)} required /></div>
              <div><Label className="mb-1">نوع</Label><Select value={overrideKind} onValueChange={(value) => setOverrideKind(value as "CLOSED" | "CUSTOM")}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="CLOSED">تعطیل</SelectItem><SelectItem value="CUSTOM">ساعت ویژه</SelectItem></SelectContent></Select></div>
              {overrideKind === "CUSTOM" && <><div><Label className="mb-1">شروع</Label><Input type="time" value={overrideStart} onChange={(event) => setOverrideStart(event.target.value)} required /></div><div><Label className="mb-1">پایان</Label><Input type="time" value={overrideEnd} onChange={(event) => setOverrideEnd(event.target.value)} required /></div></>}
              <Button className="col-span-2" disabled={busy !== null} type="submit"><Plus className="size-4" /> ثبت در تقویم</Button>
            </form>
            <div className="max-h-52 space-y-2 overflow-y-auto">
              {overrides.map((item) => <div key={item.id} className="flex items-center justify-between rounded-xl bg-slate-50 p-3 text-sm"><span>{item.date} · {item.kind === "CLOSED" ? "تعطیل" : `${timeLabel(item.start_time)} تا ${timeLabel(item.end_time)}`}</span><Button type="button" size="icon" variant="ghost" aria-label="حذف استثنای تقویم" disabled={busy !== null} onClick={() => void remove(`/admin/appointments/availability/overrides/${item.id}/`, `override-${item.id}`, "استثنای تقویم حذف شد.")}><Trash2 className="size-4 text-red-500" /></Button></div>)}
            </div>
          </div>

          <div className="space-y-4 rounded-2xl border border-cyan-100 bg-cyan-50/40 p-4">
            <div><h3 className="font-bold text-slate-800">ساخت بازه‌های قابل رزرو</h3><p className="mt-1 text-xs text-slate-500">حداکثر ۶۲ روز؛ اجرای دوباره، بازه تکراری ایجاد نمی‌کند.</p></div>
            <form onSubmit={generate} className="grid grid-cols-2 gap-3">
              <div><Label className="mb-1">از تاریخ</Label><Input type="date" min={tehranDate()} value={rangeStart} onChange={(event) => setRangeStart(event.target.value)} required /></div>
              <div><Label className="mb-1">تا تاریخ</Label><Input type="date" min={rangeStart} value={rangeEnd} onChange={(event) => setRangeEnd(event.target.value)} required /></div>
              <Button className="col-span-2 bg-[#2993A3] hover:bg-[#217b88]" disabled={busy !== null} type="submit">{busy === "generate" ? <Loader2 className="size-4 animate-spin" /> : <CalendarSync className="size-4" />} ساخت تقویم نوبت‌دهی</Button>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
