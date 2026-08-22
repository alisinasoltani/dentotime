"use client";

import { useState } from "react";
import ChatList from "@/components/admin/chat/chat-list";
import ChatWindow from "@/components/admin/chat/chat-window";
import { ChatThread } from "@/lib/types";

export default function ChatPage() {
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
    <div className="flex h-[calc(100vh-4rem)] min-h-0 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
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
    </div>
  );
}
