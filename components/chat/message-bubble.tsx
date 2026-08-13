import React from "react";
import { ChatMessage } from "@/lib/types";
import { cn } from "@/lib/utils";

const MessageBubble = React.memo(({ message, isSender }: { message: ChatMessage; isSender: boolean }) => {
  return (
    <div className={cn("flex w-full mb-4", isSender ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[70%] px-8 py-6 shadow-sm text-right",
          isSender
            ? "bg-[#E9F5F9] border border-[#81E0FF] rounded-[60px] rounded-tr-none" 
            : "bg-[#FDFDFD] border border-[#CBCBCB] rounded-[60px] rounded-tl-none"
        )}
        style={{ direction: 'rtl' }}
      >
        <p className="text-gray-800 text-sm whitespace-pre-wrap wrap-break-words">{message.body}</p>
        {message.attachments && message.attachments.length > 0 && (
          <div className="mt-2 flex flex-col gap-2">
            {message.attachments.map((att, idx) => (
              att.download_url ? (
                <a key={att.asset_id || idx} href={att.download_url} target="_blank" rel="noreferrer" className="text-xs text-blue-500 underline">
                  {att.file_name || "فایل پیوست"}
                </a>
              ) : (
                <span key={att.asset_id || idx} className="text-xs text-gray-500">
                  {att.file_name || "فایل پیوست"} — در حال بررسی امنیتی
                </span>
              )
            ))}
          </div>
        )}
        <span className={cn("text-[10px] mt-1 block", isSender ? "text-[#2993A3]" : "text-gray-400")}>
          {new Date(message.created_at).toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>
    </div>
  );
});
MessageBubble.displayName = "MessageBubble";
export default MessageBubble;
