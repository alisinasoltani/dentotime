"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Headset, Loader2, Paperclip, Send, X } from "lucide-react";
import { toast } from "sonner";

import MessageBubble from "@/components/chat/message-bubble";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useChatHistory } from "@/hooks/use-chat-history";
import { sendMessageApi } from "@/lib/chat";
import type { ChatMessage, ChatThread, User } from "@/lib/types";
import { uploadFile } from "@/lib/upload";


interface RoleChatWindowProps {
  thread: ChatThread | null;
  currentUser: Pick<User, "id" | "role" | "first_name" | "last_name"> | null;
  canUpload?: boolean;
  canWriteInternalNotes?: boolean;
  onBack?: () => void;
}


export default function RoleChatWindow({
  thread,
  currentUser,
  canUpload = false,
  canWriteInternalNotes = false,
  onBack,
}: RoleChatWindowProps) {
  const history = useChatHistory(thread?.id);
  const [newMessage, setNewMessage] = useState("");
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollAreaRef.current) {
      const viewport = scrollAreaRef.current.querySelector(
        "[data-radix-scroll-area-viewport]",
      );
      if (viewport) viewport.scrollTop = viewport.scrollHeight;
    }
  }, [history.messages]);

  useEffect(() => setIsInternalNote(false), [thread?.id]);

  const optimisticMessage = (
    id: string,
    body: string,
    attachments: ChatMessage["attachments"] = [],
  ): ChatMessage => ({
    id,
    thread: thread?.id || "",
    sender: {
      id: currentUser ? String(currentUser.id) : null,
      role: currentUser?.role || "USER",
      first_name: currentUser?.first_name || "",
      last_name: currentUser?.last_name || "",
    },
    sender_type: currentUser?.role || "USER",
    body,
    visibility: isInternalNote ? "ADMINS_ONLY" : "PARTICIPANTS",
    is_internal_note: isInternalNote,
    attachments,
    created_at: new Date().toISOString(),
  });

  const handleSend = async () => {
    const body = newMessage.trim();
    if (!body || !thread || !currentUser) return;
    const temporaryId = `temporary-${crypto.randomUUID()}`;
    history.addOptimistic(optimisticMessage(temporaryId, body));
    setNewMessage("");
    try {
      const saved = await sendMessageApi(
        thread.id,
        body,
        [],
        isInternalNote ? "ADMINS_ONLY" : "PARTICIPANTS",
      );
      history.replaceMessage(temporaryId, saved);
    } catch {
      history.removeMessage(temporaryId);
      toast.error("ارسال پیام ناموفق بود");
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !thread || !currentUser || !canUpload || isInternalNote) return;
    const controller = new AbortController();
    setAbortController(controller);
    setIsUploading(true);
    setUploadProgress(0);
    try {
      const uploaded = await uploadFile(file, {
        purpose: "chat_attachment",
        fileName: file.name,
        threadId: thread.id,
        onProgress: setUploadProgress,
        signal: controller.signal,
      });
      const temporaryId = `temporary-file-${crypto.randomUUID()}`;
      history.addOptimistic(
        optimisticMessage(temporaryId, "", [
          {
            asset_id: uploaded.asset_id,
            file_name: uploaded.file_name,
            file_size: uploaded.file_size,
            file_content_type: uploaded.file_content_type,
            state: uploaded.state,
            scan_status: uploaded.scan_status,
          },
        ]),
      );
      const saved = await sendMessageApi(thread.id, "", [uploaded.asset_id]);
      history.replaceMessage(temporaryId, saved);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "آپلود فایل ناموفق بود");
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      setAbortController(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  if (!thread) {
    return (
      <div className="hidden min-w-0 flex-1 items-center justify-center text-gray-400 md:flex">
        یک گفتگو را برای شروع انتخاب کنید
      </div>
    );
  }

  const participant = thread.participant;
  const isAdministrator = currentUser?.role === "ADMIN";
  const title = isAdministrator
    ? participant
      ? `${participant.first_name} ${participant.last_name}`.trim()
      : `${thread.guest_contact?.first_name || "مهمان"} ${thread.guest_contact?.last_name || ""}`.trim()
    : "پشتیبانی دنتو تایم";
  const avatar = isAdministrator ? participant?.profile_picture : undefined;

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col bg-white">
      <div className="flex min-w-0 items-center gap-3 border-b border-gray-100 p-4">
        {onBack && (
          <button
            type="button"
            aria-label="بازگشت به فهرست گفتگوها"
            onClick={onBack}
            className="rounded-full p-2 hover:bg-gray-100 md:hidden"
          >
            <ArrowRight className="h-5 w-5" />
          </button>
        )}
        <Avatar className="h-10 w-10 shrink-0 bg-[#E9F5F9]">
          <AvatarImage src={avatar || undefined} />
          <AvatarFallback className="bg-[#E9F5F9] text-[#2993A3]">
            {isAdministrator ? title[0] || "؟" : <Headset className="h-5 w-5" />}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-bold text-gray-800">{title}</h2>
          {isAdministrator && !participant && thread.guest_contact && (
            <p className="text-xs text-gray-500">{thread.guest_contact.phone_number}</p>
          )}
        </div>
      </div>

      <ScrollArea ref={scrollAreaRef} className="flex-1 bg-[#F9FAFB] p-4">
        {history.hasOlder && (
          <div className="mb-4 flex justify-center">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={history.isLoadingOlder}
              onClick={() => void history.loadOlder()}
            >
              {history.isLoadingOlder ? "در حال دریافت…" : "نمایش پیام‌های قدیمی‌تر"}
            </Button>
          </div>
        )}
        {history.isLoading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-[#2993A3]" />
          </div>
        ) : (
          history.messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              isSender={String(message.sender.id) === String(currentUser?.id)}
            />
          ))
        )}
      </ScrollArea>

      <div className="border-t border-gray-100 bg-white p-4">
        {canWriteInternalNotes && (
          <label className="mb-2 flex cursor-pointer items-center gap-2 text-xs text-gray-600">
            <input
              type="checkbox"
              checked={isInternalNote}
              onChange={(event) => setIsInternalNote(event.target.checked)}
            />
            یادداشت داخلی (فقط مدیران)
          </label>
        )}
        {isUploading && (
          <div className="mb-2 flex items-center gap-2">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full bg-[#2993A3]"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            <span className="w-10 text-left text-xs text-gray-500">{uploadProgress}%</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="لغو آپلود"
              onClick={() => abortController?.abort()}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
        <div className="flex items-center gap-2">
          {canUpload && !isInternalNote && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={handleFileUpload}
                accept="image/png,image/jpeg,image/webp,application/pdf,.stl,.ply,.obj,.3dm,.dcm"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="افزودن فایل"
                disabled={isUploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {isUploading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Paperclip className="h-5 w-5" />
                )}
              </Button>
            </>
          )}
          <Input
            value={newMessage}
            maxLength={4000}
            onChange={(event) => setNewMessage(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) void handleSend();
            }}
            placeholder={isInternalNote ? "یادداشت داخلی…" : "پیام خود را بنویسید…"}
            className="min-w-0 flex-1 rounded-full"
          />
          <Button
            type="button"
            aria-label="ارسال پیام"
            disabled={!newMessage.trim() || !currentUser}
            onClick={() => void handleSend()}
            className="h-10 w-10 shrink-0 rounded-full bg-[#2993A3] p-0"
          >
            <Send className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
