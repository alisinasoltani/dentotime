import type { ComponentProps } from "react";
import SupportChatList from "@/components/chat/support-chat-list";

export default function UserChatList(
  props: ComponentProps<typeof SupportChatList>,
) {
  return <SupportChatList {...props} allowDirectConversations />;
}
