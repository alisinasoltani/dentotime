"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowRight, CalendarDays, Loader2, Search, UsersRound } from "lucide-react";
import { format } from "date-fns-jalali";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  getAdminConversationHistory,
  getAdminConversationHistoryDetail,
} from "@/lib/chat";
import type {
  AdminConversationHistoryDetail,
  AdminConversationHistoryThread,
  AdminConversationParticipant,
} from "@/lib/types";
import { cn } from "@/lib/utils";

function roleLabel(role: AdminConversationParticipant["role"]) {
  if (role === "DOCTOR") return "پزشک";
  if (role === "USER") return "کاربر";
  if (role === "GUEST") return "مهمان";
  return "مدیر / پشتیبانی";
}

function roleClass(role: AdminConversationParticipant["role"]) {
  if (role === "DOCTOR") return "bg-[#E9F5F9] text-[#247F8D]";
  if (role === "USER") return "bg-[#EEF3FF] text-[#4B65A6]";
  if (role === "GUEST") return "bg-slate-100 text-slate-600";
  return "bg-amber-50 text-amber-700";
}

function displayName(participant: AdminConversationParticipant) {
  return `${participant.first_name} ${participant.last_name}`.trim();
}

function jalaliDate(value: string | null | undefined) {
  if (!value) return "بدون تاریخ";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "بدون تاریخ";
  return format(date, "yyyy/MM/dd HH:mm");
}

function ParticipantPills({ participants }: { participants: AdminConversationParticipant[] }) {
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-1.5 text-right">
      {participants.map((participant, index) => (
        <span key={`${participant.id ?? participant.role}-${index}`} className="inline-flex min-w-0 max-w-full flex-wrap items-center gap-1.5">
          <span className="min-w-0 break-words [overflow-wrap:anywhere] text-sm font-bold text-slate-800">
            {displayName(participant)}
          </span>
          <Badge variant="secondary" className={cn("rounded-full px-2 py-0.5 text-[10px]", roleClass(participant.role))}>
            {roleLabel(participant.role)}
          </Badge>
          {index < participants.length - 1 ? <span className="text-xs text-slate-300">·</span> : null}
        </span>
      ))}
    </span>
  );
}

function ThreadRow({
  thread,
  selected,
  onSelect,
}: {
  thread: AdminConversationHistoryThread;
  selected: boolean;
  onSelect: () => void;
}) {
  const firstPerson = thread.participants[0];
  return (
    <button
      type="button"
      data-testid="chat-history-row"
      onClick={onSelect}
      className={cn(
        "w-full min-w-0 border-b border-slate-100 p-4 text-right transition-colors hover:bg-[#F8FCFD]",
        selected && "bg-[#EFFAFB]",
      )}
    >
      <span className="flex min-w-0 items-start gap-3">
        <Avatar className="size-11 shrink-0 border border-slate-100">
          <AvatarImage src={undefined} alt="" />
          <AvatarFallback className="bg-[#EAF6F8] text-[#247F8D]">
            {firstPerson ? firstPerson.first_name?.[0] || <UsersRound className="size-5" /> : <UsersRound className="size-5" />}
          </AvatarFallback>
        </Avatar>
        <span className="min-w-0 flex-1">
          <span className="block"><ParticipantPills participants={thread.participants} /></span>
          <span className="mt-2 block truncate text-xs text-slate-500">{thread.last_message || "بدون پیام"}</span>
          <span className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
            <span className="inline-flex items-center gap-1"><CalendarDays className="size-3.5 shrink-0" /><bdi dir="ltr">{jalaliDate(thread.last_message_at || thread.created_at)}</bdi></span>
            <Badge variant="outline" className="rounded-full text-[10px]">{thread.message_count.toLocaleString("fa-IR")} پیام</Badge>
          </span>
        </span>
      </span>
    </button>
  );
}

function HistoryDetail({
  detail,
  onBack,
}: {
  detail: AdminConversationHistoryDetail | null;
  onBack: () => void;
}) {
  if (!detail) {
    return (
      <div className="hidden min-w-0 flex-1 items-center justify-center p-8 text-sm text-slate-400 md:flex">
        یک گفتگو را برای دیدن سوابق انتخاب کنید
      </div>
    );
  }

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-white" aria-label="جزئیات سابقه گفتگو">
      <header className="flex items-center gap-3 border-b border-slate-100 p-4">
        <Button type="button" variant="ghost" size="icon" onClick={onBack} className="md:hidden" aria-label="بازگشت به فهرست سوابق">
          <ArrowRight className="size-5" />
        </Button>
        <div className="min-w-0 flex-1">
          <ParticipantPills participants={detail.participants} />
          <p className="mt-1 text-xs text-slate-500">{detail.message_count.toLocaleString("fa-IR")} پیام در این گفتگو</p>
        </div>
        <Badge variant="outline" className="shrink-0 rounded-full text-[10px]">{detail.status === "OPEN" ? "باز" : "بایگانی‌شده"}</Badge>
      </header>

      <ScrollArea dir="rtl" className="min-h-0 min-w-0 flex-1 bg-[#F9FAFB] p-4 text-right" viewportClassName="[&>div]:block!">
        <div className="mx-auto flex max-w-3xl flex-col gap-3">
          {detail.messages.length ? detail.messages.map((message) => (
            <article key={message.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <strong className="truncate text-sm text-slate-800">
                    {`${message.sender.first_name} ${message.sender.last_name}`.trim() || "مهمان"}
                  </strong>
                  <Badge variant="secondary" className={cn("rounded-full px-2 py-0.5 text-[10px]", roleClass(message.sender.role === "ADMIN" ? "ADMIN" : message.sender.role === "GUEST" ? "GUEST" : message.sender.role))}>
                    {roleLabel(message.sender.role === "ADMIN" ? "ADMIN" : message.sender.role === "GUEST" ? "GUEST" : message.sender.role)}
                  </Badge>
                  {message.is_internal_note ? <Badge className="rounded-full bg-amber-100 text-[10px] text-amber-800">یادداشت داخلی</Badge> : null}
                </div>
                <time dateTime={message.created_at} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] text-slate-500">
                  <CalendarDays className="size-3.5" />
                  <bdi dir="ltr">{jalaliDate(message.created_at)}</bdi>
                </time>
              </div>
              {message.body ? <p className="mt-3 whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-right text-sm leading-7 text-slate-700">{message.body}</p> : null}
              {message.attachments.length ? <p className="mt-2 text-xs text-slate-500">{message.attachments.length.toLocaleString("fa-IR")} فایل پیوست</p> : null}
            </article>
          )) : (
            <p className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">پیامی برای این گفتگو ثبت نشده است.</p>
          )}
        </div>
      </ScrollArea>
    </section>
  );
}

export default function AdminChatHistoryPanel() {
  const [threads, setThreads] = useState<AdminConversationHistoryThread[]>([]);
  const [nextPage, setNextPage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminConversationHistoryDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const loadThreads = useCallback(async (query: string) => {
    setIsLoading(true);
    try {
      const page = await getAdminConversationHistory(query);
      setThreads(page.results);
      setNextPage(page.next);
      setSelectedId((current) => current && page.results.some((item) => item.id === current) ? current : null);
      setDetail(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadThreads(search), 300);
    return () => window.clearTimeout(timer);
  }, [loadThreads, search]);

  const selectThread = async (threadId: string) => {
    setSelectedId(threadId);
    setIsLoadingDetail(true);
    try {
      setDetail(await getAdminConversationHistoryDetail(threadId));
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const loadMore = async () => {
    if (!nextPage || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const page = await getAdminConversationHistory("", nextPage);
      setThreads((current) => [...current, ...page.results.filter((item) => !current.some((old) => old.id === item.id))]);
      setNextPage(page.next);
    } finally {
      setIsLoadingMore(false);
    }
  };

  return (
    <div data-testid="chat-history" className="flex h-[calc(100vh-4rem)] min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white text-right shadow-sm" dir="rtl">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
        <div>
          <h1 className="text-xl font-black text-slate-900">سوابق کامل گفتگوها</h1>
          <p className="mt-1 text-xs text-slate-500">تمام گفتگوهای کاربران، پزشکان، مهمانان و پشتیبانی با تاریخ شمسی</p>
        </div>
        <div className="relative w-full max-w-xs">
          <Search className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="جستجوی نام یا شماره…" className="h-10 rounded-xl pr-10" aria-label="جستجوی سوابق گفتگو" />
        </div>
      </header>

      <div className="flex min-h-0 min-w-0 flex-1">
        <aside aria-label="فهرست سوابق گفتگو" className={cn("flex min-h-0 min-w-0 w-full shrink-0 flex-col overflow-hidden border-l border-slate-100 md:w-[min(42%,390px)]", detail && "hidden md:flex")}>
          <ScrollArea dir="rtl" className="min-h-0 min-w-0 flex-1" viewportClassName="[&>div]:block!">
            {isLoading ? <div className="flex min-h-40 items-center justify-center"><Loader2 className="size-6 animate-spin text-[#2993A3]" /></div> : threads.length ? threads.map((thread) => <ThreadRow key={thread.id} thread={thread} selected={thread.id === selectedId} onSelect={() => void selectThread(thread.id)} />) : <p className="p-8 text-center text-sm text-slate-500">سابقه‌ای پیدا نشد.</p>}
            {nextPage ? <div className="p-4 text-center"><Button type="button" variant="outline" size="sm" onClick={() => void loadMore()} disabled={isLoadingMore}>{isLoadingMore ? "در حال دریافت…" : "نمایش سوابق بیشتر"}</Button></div> : null}
          </ScrollArea>
        </aside>
        {isLoadingDetail ? <div className="flex min-w-0 flex-1 items-center justify-center"><Loader2 className="size-6 animate-spin text-[#2993A3]" /></div> : <HistoryDetail detail={detail} onBack={() => { setSelectedId(null); setDetail(null); }} />}
      </div>
    </div>
  );
}
