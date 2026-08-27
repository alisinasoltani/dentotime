"use client";

import { useState } from "react";
import { Archive, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import ChatList from "@/components/admin/chat/chat-list";
import ChatWindow from "@/components/admin/chat/chat-window";
import AdminChatHistoryPanel from "@/components/admin/chat/history-panel";
import { ChatThread } from "@/lib/types";

export default function ChatPage() {
  const [view, setView] = useState<"inbox" | "history">("inbox");
  const [activeThread, setActiveThread] = useState<ChatThread | null>(null);
  const [showChatMobile, setShowChatMobile] = useState(false);

  const handleSelectThread = (thread: ChatThread) => {
    setActiveThread(thread);
    setShowChatMobile(true);
  };

  const handleBack = () => {
    setShowChatMobile(false);
  };

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col gap-4">
      <div className="flex items-center justify-end gap-2" dir="rtl">
        <Button type="button" variant={view === "inbox" ? "default" : "outline"} onClick={() => setView("inbox")} className={view === "inbox" ? "bg-[#2993A3] hover:bg-[#227D8A]" : ""}>
          <MessageSquare data-icon="inline-start" /> گفتگوهای جاری
        </Button>
        <Button type="button" variant={view === "history" ? "default" : "outline"} onClick={() => setView("history")} className={view === "history" ? "bg-[#2993A3] hover:bg-[#227D8A]" : ""}>
          <Archive data-icon="inline-start" /> سوابق کامل گفتگوها
        </Button>
      </div>

      {view === "history" ? <AdminChatHistoryPanel /> : <div className="flex h-[calc(100vh-8rem)] min-h-0 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
      {/* لیست چت‌ها - در دسکتاپ همیشه دیده می‌شود، در موبایل اگر showChatMobile false باشد */}
      <div className={`${showChatMobile ? "hidden" : "flex"} min-h-0 w-full md:flex md:w-auto`}>
        <ChatList 
          onSelectThread={handleSelectThread} 
          activeThreadId={activeThread?.id || null} 
          onBack={handleBack}
        />
      </div>

      {/* پنجره چت - در دسکتاپ همیشه دیده می‌شود، در موبایل اگر showChatMobile true باشد */}
      <div className={`${showChatMobile ? "flex" : "hidden"} min-h-0 flex-1 md:flex`}>
        <ChatWindow thread={activeThread} onBack={handleBack} />
      </div>
      </div>}
    </div>
  );
}
