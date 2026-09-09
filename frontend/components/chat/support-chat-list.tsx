"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Headset, Plus, Stethoscope, UserRound } from "lucide-react";
import { toast } from "sonner";

import NewConversationDialog from "@/components/chat/new-conversation-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { getOrCreateThread, getThreads } from "@/lib/chat";
import type { ChatThread } from "@/lib/types";
import { cn } from "@/lib/utils";


export default function SupportChatList({
  onSelectThread,
  activeThreadId,
  onBack,
  allowDirectConversations = false,
}: {
  onSelectThread: (thread: ChatThread) => void;
  activeThreadId: string | null;
  onBack?: () => void;
  allowDirectConversations?: boolean;
}) {
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [isNewConversationOpen, setIsNewConversationOpen] = useState(false);

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
    if (allowDirectConversations) {
      setIsNewConversationOpen(true);
      return;
    }
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

  const addAndSelectThread = (thread: ChatThread) => {
    setThreads((current) => {
      const withoutCurrent = current.filter((item) => item.id !== thread.id);
      return [thread, ...withoutCurrent];
    });
    onSelectThread(thread);
  };

  return (
    <div dir="rtl" data-testid="support-chat-sidebar" className="flex h-full min-w-0 w-full flex-col overflow-hidden border-l border-gray-100 bg-white">
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
      <ScrollArea dir="rtl" className="min-h-0 min-w-0 flex-1" viewportClassName="[&>div]:block!">
        {threads.length === 0 ? (
          <p className="p-8 text-center text-sm text-gray-400">گفتگویی یافت نشد</p>
        ) : (
          threads.map((thread) => {
            const isDirect = thread.thread_type === "DIRECT";
            const name = isDirect
              ? `${thread.participant?.first_name || ""} ${thread.participant?.last_name || ""}`.trim()
              : "پشتیبانی دنتو تایم";
            const roleLabel = isDirect
              ? thread.participant?.role === "DOCTOR"
                ? "پزشک"
                : "کاربر"
              : "پشتیبانی";
            return (
            <div key={thread.id}>
              <button
                type="button"
                data-testid="chat-thread-row"
                onClick={() => onSelectThread(thread)}
                className={cn(
                  "flex w-full min-w-0 items-center gap-3 p-3 text-right",
                  activeThreadId === thread.id ? "bg-[#F5FAFF]" : "hover:bg-gray-50",
                )}
              >
                <Avatar className="size-12 shrink-0 bg-[#E9F5F9]">
                  <AvatarImage src={thread.participant?.profile_picture || undefined} alt="" />
                  <AvatarFallback className="bg-[#E9F5F9] text-[#2993A3]">
                    {isDirect ? (
                      thread.participant?.role === "DOCTOR" ? (
                        <Stethoscope className="size-5" />
                      ) : (
                        <UserRound className="size-5" />
                      )
                    ) : (
                      <Headset className="size-5" />
                    )}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <h3 className="truncate text-sm font-semibold text-gray-800">
                      {name}
                    </h3>
                    <Badge
                      variant="secondary"
                      className="shrink-0 rounded-full bg-[#E9F5F9] px-2 py-0.5 text-[10px] text-[#247F8D]"
                    >
                      {roleLabel}
                    </Badge>
                  </div>
                  <p className="truncate text-xs text-gray-500">
                    {thread.last_message || "بدون پیام"}
                  </p>
                </div>
                {thread.unread_count > 0 && (
                  <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-[#2993A3] px-1 text-[10px] font-bold text-white">
                    {thread.unread_count}
                  </span>
                )}
              </button>
              <Separator />
            </div>
          )})
        )}
      </ScrollArea>
      {allowDirectConversations ? (
        <NewConversationDialog
          open={isNewConversationOpen}
          onOpenChange={setIsNewConversationOpen}
          onThreadCreated={addAndSelectThread}
        />
      ) : null}
    </div>
  );
}
