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
    <div className="h-[calc(100vh-4rem)] md:h-[calc(100vh-4rem)] flex bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      {/* لیست چت‌ها - در دسکتاپ همیشه دیده می‌شود، در موبایل اگر showChatMobile false باشد */}
      <div className={`${showChatMobile ? "hidden" : "flex"} md:flex w-full md:w-auto`}>
        <ChatList 
          onSelectThread={handleSelectThread} 
          activeThreadId={activeThread?.id || null} 
          onBack={handleBack}
        />
      </div>

      {/* پنجره چت - در دسکتاپ همیشه دیده می‌شود، در موبایل اگر showChatMobile true باشد */}
      <div className={`${showChatMobile ? "flex" : "hidden"} md:flex flex-1`}>
        <ChatWindow thread={activeThread} onBack={handleBack} />
      </div>
    </div>
  );
}