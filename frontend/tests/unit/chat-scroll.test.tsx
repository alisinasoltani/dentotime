import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import RoleChatWindow from "@/components/chat/role-chat-window";
import type { ChatMessage, ChatThread } from "@/lib/types";


let messages: ChatMessage[] = [];


vi.mock("@/hooks/use-chat-history", () => ({
  useChatHistory: () => ({
    messages,
    isLoading: false,
    isLoadingOlder: false,
    hasOlder: false,
    connectionStatus: "connected",
    loadOlder: vi.fn(),
    addOptimistic: vi.fn(),
    replaceMessage: vi.fn(),
    removeMessage: vi.fn(),
  }),
}));

vi.mock("@/components/chat/message-bubble", () => ({
  default: ({ message }: { message: ChatMessage }) => <p>{message.body}</p>,
}));

vi.mock("@/lib/chat", () => ({ sendMessageApi: vi.fn() }));
vi.mock("@/lib/upload", () => ({ uploadFile: vi.fn() }));


const thread: ChatThread = {
  id: "thread-one",
  thread_type: "USER_ADMIN",
  participant: {
    id: "1",
    first_name: "کاربر",
    last_name: "آزمون",
    role: "USER",
  },
  guest_contact: null,
  assigned_admin: null,
  status: "OPEN",
  unread_count: 0,
  last_message: "",
  last_message_at: null,
  created_at: new Date().toISOString(),
};


function message(id: string, senderId: string, body: string): ChatMessage {
  return {
    id,
    thread: thread.id,
    sender: {
      id: senderId,
      role: senderId === "1" ? "USER" : "ADMIN",
      first_name: "",
      last_name: "",
    },
    sender_type: senderId === "1" ? "USER" : "ADMIN",
    body,
    visibility: "PARTICIPANTS",
    is_internal_note: false,
    attachments: [],
    created_at: new Date().toISOString(),
  };
}


describe("chat message scrolling", () => {
  beforeEach(() => {
    messages = [message("m1", "2", "پیام اول")];
  });

  it("keeps the reading position for remote messages and follows the sender's own message", async () => {
    const view = render(
      <RoleChatWindow
        thread={thread}
        currentUser={{ id: "1", role: "USER", first_name: "", last_name: "" }}
      />,
    );
    const root = view.container.querySelector<HTMLElement>("[data-slot='scroll-area']");
    const viewport = view.container.querySelector<HTMLElement>(
      "[data-radix-scroll-area-viewport]",
    );
    expect(root?.className).toContain("min-h-0");
    expect(viewport).not.toBeNull();

    Object.defineProperty(viewport, "clientHeight", { configurable: true, value: 100 });
    Object.defineProperty(viewport, "scrollHeight", { configurable: true, value: 1000 });
    viewport!.scrollTop = 100;
    act(() => viewport!.dispatchEvent(new Event("scroll")));

    messages = [...messages, message("m2", "2", "پیام دریافتی")];
    view.rerender(
      <RoleChatWindow
        thread={thread}
        currentUser={{ id: "1", role: "USER", first_name: "", last_name: "" }}
      />,
    );
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });
    expect(viewport!.scrollTop).toBe(100);

    messages = [...messages, message("m3", "1", "پیام خودم")];
    view.rerender(
      <RoleChatWindow
        thread={thread}
        currentUser={{ id: "1", role: "USER", first_name: "", last_name: "" }}
      />,
    );
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });
    expect(viewport!.scrollTop).toBe(1000);
  });
});
