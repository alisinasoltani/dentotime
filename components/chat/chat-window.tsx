"use client";

import RoleChatWindow from "@/components/chat/role-chat-window";
import { useDoctorContext } from "@/context/doctor-context";
import type { ChatThread } from "@/lib/types";

export default function DoctorChatWindow({
  thread,
  onBack,
}: {
  thread: ChatThread | null;
  onBack?: () => void;
}) {
  const { user } = useDoctorContext();
  return (
    <RoleChatWindow
      thread={thread}
      currentUser={user}
      canUpload
      onBack={onBack}
    />
  );
}
