"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Headset, Plus } from "lucide-react";
import { toast } from "sonner";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { getOrCreateThread, getThreads } from "@/lib/chat";
import type { ChatThread } from "@/lib/types";
import { cn } from "@/lib/utils";


export default function SupportChatList({
  onSelectThread,
  activeThreadId,
  onBack,
}: {
  onSelectThread: (thread: ChatThread) => void;
  activeThreadId: string | null;
  onBack?: () => void;
}) {
  const [threads, setThreads] = useState<ChatThread[]>([]);

  const refresh = useCallback(async () => {
    try {
      setThreads(await getThreads());
    } catch (error) {
      console.error("Unable to load conversations", error);
    }
  }, []);

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

  const createConversation = async () => {
    try {
      const thread = await getOrCreateThread();
      setThreads((current) =>
        current.some((item) => item.id === thread.id)
          ? current
          : [thread, ...current],
      );
      onSelectThread(thread);
    } catch {
      toast.error("ایجاد گفتگوی جدید ناموفق بود");
    }
  };

  return (
    <div className="flex h-full w-full flex-col border-l border-gray-100 bg-white">
      <div className="flex items-center justify-between border-b border-gray-100 p-4">
        <div className="flex items-center gap-2">
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
        <button
          type="button"
          onClick={() => void createConversation()}
          className="flex items-center gap-1 rounded-full bg-[#E9F5F9] px-3 py-1.5 text-xs font-medium text-[#2993A3]"
        >
          <Plus className="h-4 w-4" /> گفتگوی جدید
        </button>
      </div>
      <ScrollArea className="flex-1">
        {threads.length === 0 ? (
          <p className="p-8 text-center text-sm text-gray-400">گفتگویی یافت نشد</p>
        ) : (
          threads.map((thread) => (
            <div key={thread.id}>
              <button
                type="button"
                onClick={() => onSelectThread(thread)}
                className={cn(
                  "flex w-full items-center gap-3 p-3 text-right",
                  activeThreadId === thread.id ? "bg-[#F5FAFF]" : "hover:bg-gray-50",
                )}
              >
                {thread.unread_count > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#2993A3] px-1 text-[10px] font-bold text-white">
                    {thread.unread_count}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-semibold text-gray-800">
                    پشتیبانی دنتو تایم
                  </h3>
                  <p className="truncate text-xs text-gray-500">
                    {thread.last_message || "بدون پیام"}
                  </p>
                </div>
                <Avatar className="h-12 w-12 bg-[#E9F5F9]">
                  <AvatarFallback className="bg-[#E9F5F9] text-[#2993A3]">
                    <Headset className="h-5 w-5" />
                  </AvatarFallback>
                </Avatar>
              </button>
              <Separator />
            </div>
          ))
        )}
      </ScrollArea>
    </div>
  );
}
