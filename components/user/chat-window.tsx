"use client";

import { useEffect, useState } from "react";

import RoleChatWindow from "@/components/chat/role-chat-window";
import { getCurrentUser } from "@/lib/auth";
import type { ChatThread, User } from "@/lib/types";

export default function UserChatWindow({
  thread,
  onBack,
}: {
  thread: ChatThread | null;
  onBack?: () => void;
}) {
  const [user, setUser] = useState<User | null>(null);
  useEffect(() => {
    void getCurrentUser().then(setUser);
  }, []);
  return <RoleChatWindow thread={thread} currentUser={user} onBack={onBack} />;
}
