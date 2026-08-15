"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, MoreVertical, Search, Trash2 } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { deleteThreadApi, getThreadsPage } from "@/lib/chat";
import type { ChatThread } from "@/lib/types";
import { cn } from "@/lib/utils";


type Category = "all" | "unread" | "doctors" | "users";

export default function AdminChatList({
  onSelectThread,
  activeThreadId,
  onBack,
}: {
  onSelectThread: (thread: ChatThread) => void;
  activeThreadId: string | null;
  onBack?: () => void;
}) {
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [nextPage, setNextPage] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [activeCategory, setActiveCategory] = useState<Category>("all");

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(search), 350);
    return () => window.clearTimeout(timeout);
  }, [search]);

  const refresh = useCallback(async () => {
    try {
      const page = await getThreadsPage(debouncedSearch);
      setThreads(page.results);
      setNextPage(page.next);
    } catch (error) {
      console.error("Unable to load conversations", error);
    }
  }, [debouncedSearch]);

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (!document.hidden) void refresh();
    };
    const initial = window.setTimeout(refreshWhenVisible, 0);
    const interval = window.setInterval(refreshWhenVisible, 30_000);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [refresh]);

  const loadMore = async () => {
    if (!nextPage || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const page = await getThreadsPage(undefined, nextPage);
      setThreads((current) => {
        const merged = new Map(current.map((thread) => [thread.id, thread]));
        page.results.forEach((thread) => merged.set(thread.id, thread));
        return [...merged.values()];
      });
      setNextPage(page.next);
    } finally {
      setIsLoadingMore(false);
    }
  };

  const visibleThreads = useMemo(
    () =>
      threads.filter((thread) => {
        if (activeCategory === "unread") return thread.unread_count > 0;
        if (activeCategory === "doctors") return thread.participant?.role === "DOCTOR";
        if (activeCategory === "users") {
          return !thread.participant || thread.participant.role === "USER";
        }
        return true;
      }),
    [activeCategory, threads],
  );

  const deleteThread = async (event: React.MouseEvent, threadId: string) => {
    event.stopPropagation();
    await deleteThreadApi(threadId);
    setThreads((current) => current.filter((thread) => thread.id !== threadId));
  };

  const categories: { id: Category; label: string }[] = [
    { id: "all", label: "همه" },
    { id: "unread", label: "خوانده‌نشده" },
    { id: "doctors", label: "پزشکان" },
    { id: "users", label: "کاربران" },
  ];

  return (
    <div className="flex h-full w-full flex-col border-l border-gray-100 bg-white md:w-87.5">
      <div className="flex items-center gap-2 border-b border-gray-100 p-4">
        {onBack && (
          <button
            type="button"
            aria-label="بازگشت"
            onClick={onBack}
            className="rounded-full p-2 hover:bg-gray-100 md:hidden"
          >
            <ArrowRight className="h-5 w-5" />
          </button>
        )}
        <h2 className="text-lg font-bold text-gray-800">گفتگوها</h2>
      </div>

      <div className="p-4">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="جستجوی نام یا شماره…"
            className="pr-10"
          />
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b px-4">
        {categories.map((category) => (
          <button
            type="button"
            key={category.id}
            onClick={() => setActiveCategory(category.id)}
            className={cn(
              "whitespace-nowrap border-b-2 px-3 py-2 text-xs font-bold",
              activeCategory === category.id
                ? "border-[#2993A3] text-[#2993A3]"
                : "border-transparent text-gray-500",
            )}
          >
            {category.label}
          </button>
        ))}
      </div>

      <ScrollArea className="flex-1">
        {visibleThreads.length === 0 ? (
          <p className="p-8 text-center text-sm text-gray-400">گفتگویی یافت نشد</p>
        ) : (
          visibleThreads.map((thread) => {
            const contact = thread.participant || thread.guest_contact;
            const name = `${contact?.first_name || "مهمان"} ${contact?.last_name || ""}`.trim();
            const role = thread.participant?.role;
            return (
              <div key={thread.id}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectThread(thread)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") onSelectThread(thread);
                  }}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 p-3",
                    activeThreadId === thread.id ? "bg-[#F5FAFF]" : "hover:bg-gray-50",
                  )}
                >
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label={`بایگانی گفتگوی ${name}`}
                        onClick={(event) => event.stopPropagation()}
                        className="rounded-full p-2 hover:bg-gray-200"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={(event) => void deleteThread(event, thread.id)}
                        className="text-red-600"
                      >
                        <Trash2 className="ml-2 h-4 w-4" /> بایگانی گفتگو
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  {thread.unread_count > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#2993A3] px-1 text-[10px] font-bold text-white">
                      {thread.unread_count}
                    </span>
                  )}
                  <div className="min-w-0 flex-1 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span className="text-[10px] text-gray-500">
                        {role === "DOCTOR" ? "پزشک" : thread.participant ? "کاربر" : "مهمان"}
                      </span>
                      <h3 className="truncate text-sm font-semibold text-gray-800">{name}</h3>
                    </div>
                    <p className="truncate text-xs text-gray-500">{thread.last_message || "بدون پیام"}</p>
                  </div>
                  <Avatar className="h-12 w-12 shrink-0">
                    <AvatarImage src={thread.participant?.profile_picture || undefined} />
                    <AvatarFallback>{name[0] || "؟"}</AvatarFallback>
                  </Avatar>
                </div>
                <Separator />
              </div>
            );
          })
        )}
        {nextPage && (
          <div className="p-4 text-center">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isLoadingMore}
              onClick={() => void loadMore()}
            >
              {isLoadingMore ? "در حال دریافت…" : "نمایش گفتگوهای بیشتر"}
            </Button>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
