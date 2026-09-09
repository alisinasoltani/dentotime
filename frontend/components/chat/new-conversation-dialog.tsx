"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isAxiosError } from "axios";
import {
  Headset,
  Loader2,
  LockKeyhole,
  MessageCircleMore,
  Pin,
  PinOff,
  Search,
  Stethoscope,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  createDirectThread,
  getChatContacts,
  getOrCreateThread,
  pinChatContact,
  unpinChatContact,
} from "@/lib/chat";
import type {
  ChatContact,
  ChatContactDirectory,
  ChatThread,
} from "@/lib/types";
import { cn } from "@/lib/utils";


type ContactRole = "ALL" | "DOCTOR" | "USER";


function contactName(contact: ChatContact) {
  return `${contact.first_name} ${contact.last_name}`.trim();
}


function ContactRow({
  contact,
  pinCount,
  pinLimit,
  isBusy,
  onStart,
  onTogglePin,
  canPin,
}: {
  contact: ChatContact;
  pinCount: number;
  pinLimit: number;
  isBusy: boolean;
  onStart: () => void;
  onTogglePin: () => void;
  canPin: boolean;
}) {
  const name = contactName(contact);
  const isSupport = contact.role === "SUPPORT";
  const pinDisabled = isSupport || (!contact.is_pinned && pinCount >= pinLimit);

  return (
    <div className="group flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3 transition-colors hover:border-[#B8E0E5] hover:bg-[#F8FCFD]">
      <Avatar className="size-11 shrink-0 border border-slate-100">
        <AvatarImage src={contact.profile_picture || undefined} alt={name} />
        <AvatarFallback className="bg-[#EAF6F8] font-bold text-[#247F8D]">
          {isSupport ? <Headset className="size-5" /> : name[0] || "؟"}
        </AvatarFallback>
      </Avatar>

      <button
        type="button"
        disabled={isBusy}
        onClick={onStart}
        className="min-w-0 flex-1 text-right disabled:opacity-60"
      >
        <span className="flex flex-wrap items-center gap-2">
          <strong className="truncate text-sm text-slate-900">{name}</strong>
          <Badge
            variant="secondary"
            className="bg-slate-100 text-[10px] text-slate-600"
          >
            {isSupport ? "پشتیبانی" : contact.role === "DOCTOR" ? "پزشک" : "کاربر"}
          </Badge>
        </span>
        <span className="mt-1 block truncate text-xs text-slate-500">
          {contact.role === "DOCTOR" && contact.specialty
            ? contact.specialty
            : contact.phone_number || "گفت‌وگو با پشتیبانی دنتوتایم"}
        </span>
      </button>

      {canPin ? (
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          disabled={pinDisabled || isBusy}
          onClick={onTogglePin}
          aria-label={
            isSupport
              ? "پشتیبانی همیشه پین است"
              : contact.is_pinned
                ? `برداشتن پین ${name}`
                : `پین کردن ${name}`
          }
          title={
            isSupport
              ? "پشتیبانی همیشه بالای فهرست می‌ماند"
              : !contact.is_pinned && pinCount >= pinLimit
                ? "حداکثر ۵ مخاطب قابل پین است"
                : undefined
          }
          className={cn(
            "shrink-0 rounded-full",
            contact.is_pinned && "bg-amber-50 text-amber-600 hover:bg-amber-100",
          )}
        >
          {isBusy ? (
            <Loader2 className="animate-spin" />
          ) : isSupport ? (
            <LockKeyhole />
          ) : contact.is_pinned ? (
            <PinOff />
          ) : (
            <Pin />
          )}
        </Button>
      ) : null}

      <Button
        type="button"
        size="icon-sm"
        disabled={isBusy}
        onClick={onStart}
        aria-label={`شروع گفتگو با ${name}`}
        className="shrink-0 rounded-full bg-[#2993A3] text-white hover:bg-[#227D8A]"
      >
        {isBusy ? <Loader2 className="animate-spin" /> : <MessageCircleMore />}
      </Button>
    </div>
  );
}


export default function NewConversationDialog({
  open,
  onOpenChange,
  onThreadCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onThreadCreated: (thread: ChatThread) => void;
}) {
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<ContactRole>("ALL");
  const [directory, setDirectory] = useState<ChatContactDirectory | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | number | null>(null);
  const requestSequence = useRef(0);

  const loadContacts = useCallback(async () => {
    const requestId = ++requestSequence.current;
    setIsLoading(true);
    try {
      const nextDirectory = await getChatContacts(search, role);
      if (requestId === requestSequence.current) setDirectory(nextDirectory);
    } catch {
      if (requestId === requestSequence.current) {
        toast.error("دریافت فهرست مخاطبان ناموفق بود");
      }
    } finally {
      if (requestId === requestSequence.current) setIsLoading(false);
    }
  }, [role, search]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => void loadContacts(), 300);
    return () => window.clearTimeout(timer);
  }, [loadContacts, open]);

  const pinnedIds = useMemo(
    () => new Set(directory?.pinned.map((contact) => String(contact.id)) || []),
    [directory?.pinned],
  );
  const results = useMemo(
    () =>
      directory?.results.filter(
        (contact) => !pinnedIds.has(String(contact.id)),
      ) || [],
    [directory?.results, pinnedIds],
  );

  const startConversation = async (contact: ChatContact) => {
    setBusyId(contact.id);
    try {
      const thread =
        contact.role === "SUPPORT"
          ? await getOrCreateThread()
          : await createDirectThread(contact.id);
      onThreadCreated(thread);
      onOpenChange(false);
    } catch {
      toast.error("شروع گفتگو ناموفق بود");
    } finally {
      setBusyId(null);
    }
  };

  const togglePin = async (contact: ChatContact) => {
    if (contact.role === "SUPPORT") return;
    setBusyId(contact.id);
    try {
      if (contact.is_pinned) await unpinChatContact(contact.id);
      else await pinChatContact(contact.id);
      await loadContacts();
    } catch (error) {
      const detail = isAxiosError(error)
        ? String(error.response?.data?.detail || "")
        : "";
      toast.error(detail || "تغییر وضعیت پین ناموفق بود");
    } finally {
      setBusyId(null);
    }
  };

  const roleOptions: Array<{
    value: ContactRole;
    label: string;
    icon: typeof UserRound;
  }> = [
    { value: "ALL", label: "همه", icon: Search },
    { value: "DOCTOR", label: "پزشکان", icon: Stethoscope },
    { value: "USER", label: "کاربران", icon: UserRound },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        dir="rtl"
        className="grid max-h-[min(90vh,760px)] max-w-2xl grid-rows-[auto_auto_auto_minmax(0,1fr)] gap-4 overflow-hidden rounded-3xl p-5 sm:max-w-2xl"
      >
        <DialogHeader className="pl-10 text-right">
          <DialogTitle className="text-xl font-black text-slate-900">
            شروع گفتگوی جدید
          </DialogTitle>
          <DialogDescription>
            پزشک یا کاربر را با نام، شماره همراه یا تخصص پیدا کنید.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="جستجو بر اساس نام، موبایل یا تخصص…"
            className="h-11 rounded-xl pr-10"
          />
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
            {roleOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setRole(option.value)}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition-colors",
                  role === option.value
                    ? "bg-white text-[#247F8D] shadow-sm"
                    : "text-slate-500 hover:text-slate-700",
                )}
              >
                <option.icon className="size-3.5" />
                {option.label}
              </button>
            ))}
          </div>
          {directory?.can_pin ? (
            <span className="text-xs font-bold text-slate-500">
              {directory.pin_count.toLocaleString("fa-IR")} از ۵ مخاطب پین‌شده
            </span>
          ) : null}
        </div>

        <ScrollArea className="min-h-0 pl-3">
          <div className="space-y-5 pb-2">
            {directory ? (
              <section aria-labelledby="pinned-contacts-title" className="space-y-2">
                <h3
                  id="pinned-contacts-title"
                  className="flex items-center gap-2 text-xs font-black text-slate-500"
                >
                  <Pin className="size-3.5 text-amber-500" />
                  مخاطبان پین‌شده
                </h3>
                {[directory.support, ...directory.pinned].map((contact) => (
                  <ContactRow
                    key={contact.id}
                    contact={contact}
                    pinCount={directory.pin_count}
                    pinLimit={directory.pin_limit}
                    isBusy={String(busyId) === String(contact.id)}
                    onStart={() => void startConversation(contact)}
                    onTogglePin={() => void togglePin(contact)}
                    canPin={Boolean(directory.can_pin)}
                  />
                ))}
              </section>
            ) : null}

            <section aria-labelledby="search-results-title" className="space-y-2">
              <h3 id="search-results-title" className="text-xs font-black text-slate-500">
                نتیجه جستجو
              </h3>
              {isLoading && !directory ? (
                <div className="flex min-h-32 items-center justify-center">
                  <Loader2 className="size-6 animate-spin text-[#2993A3]" />
                </div>
              ) : results.length ? (
                results.map((contact) => (
                  <ContactRow
                    key={contact.id}
                    contact={contact}
                    pinCount={directory?.pin_count || 0}
                    pinLimit={directory?.pin_limit || 5}
                    isBusy={String(busyId) === String(contact.id)}
                    onStart={() => void startConversation(contact)}
                    onTogglePin={() => void togglePin(contact)}
                    canPin={Boolean(directory?.can_pin)}
                  />
                ))
              ) : (
                <p className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
                  مخاطبی با این مشخصات پیدا نشد.
                </p>
              )}
            </section>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
