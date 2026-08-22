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
    <div className="mt-14 flex h-[calc(100vh-4rem)] min-h-0 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm md:mt-0">
      <div className={`${showChatMobile ? "hidden" : "flex"} min-h-0 w-full md:flex md:w-auto`}>
        <UserChatList onSelectThread={handleSelectThread} activeThreadId={activeThread?.id || null} onBack={() => setShowChatMobile(false)} />
      </div>
      <div className={`${showChatMobile ? "flex" : "hidden"} min-h-0 flex-1 md:flex`}>
        <UserChatWindow thread={activeThread} onBack={() => setShowChatMobile(false)} />
      </div>
    </div>
  );
}
