"use client";
import { useState } from "react";
import UserChatList from "@/components/user/chat-list";
import UserChatWindow from "@/components/user/chat-window";
import { ChatThread } from "@/lib/types";

export default function UserChatPage() {
  const [activeThread, setActiveThread] = useState<ChatThread | null>(null);
  const [showChatMobile, setShowChatMobile] = useState(false);

  const handleSelectThread = (thread: ChatThread) => {
    setActiveThread(thread);
    setShowChatMobile(true);
  };

  return (
    <div className="h-[calc(100vh-4rem)] md:h-[calc(100vh-4rem)] mt-14 md:mt-0 flex bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className={`${showChatMobile ? "hidden" : "flex"} md:flex w-full md:w-auto`}>
        <UserChatList onSelectThread={handleSelectThread} activeThreadId={activeThread?.id || null} onBack={() => setShowChatMobile(false)} />
      </div>
      <div className={`${showChatMobile ? "flex" : "hidden"} md:flex flex-1`}>
        <UserChatWindow thread={activeThread} onBack={() => setShowChatMobile(false)} />
      </div>
    </div>
  );
}