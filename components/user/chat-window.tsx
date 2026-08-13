"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { getMessages, sendMessageApi, markThreadRead } from "@/lib/chat";
import { uploadFile } from "@/lib/upload";
import { ChatThread, ChatMessage } from "@/lib/types";
import MessageBubble from "@/components/chat/message-bubble";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Paperclip, ArrowRight, Loader2, X, Headset } from "lucide-react";
import { toast } from "sonner";
import { getCurrentUser } from "@/lib/auth";

interface ChatWindowProps {
    thread: ChatThread | null;
    onBack?: () => void;
}

export default function UserChatWindow({ thread, onBack }: ChatWindowProps) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [newMessage, setNewMessage] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [abortController, setAbortController] = useState<AbortController | null>(null);

    const scrollAreaRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [user, setUser] = useState<any>(null);

    useEffect(() => {
        void getCurrentUser().then(setUser);
    }, []);

    const fetchMessages = useCallback(async (isInitial: boolean) => {
        if (!thread) return;
        try {
            const data = await getMessages(thread.id);
            const sortedMsgs = [...data].reverse();

            setMessages((prev) => {
                if (isInitial) return sortedMsgs;
                const existingIds = new Set(prev.map(m => m.id));
                const newMsgs = sortedMsgs.filter(m => !existingIds.has(m.id));
                return [...prev, ...newMsgs];
            });

            if (isInitial) await markThreadRead(thread.id);
        } catch (err) { console.error(err); }
    }, [thread]);

    useEffect(() => {
        if (!thread) return;
        setMessages([]);
        setIsLoading(true);
        fetchMessages(true).finally(() => setIsLoading(false));
        const interval = setInterval(() => fetchMessages(false), 3000);
        return () => clearInterval(interval);
    }, [thread, fetchMessages]);

    useEffect(() => {
        if (scrollAreaRef.current) {
            const scrollElement = scrollAreaRef.current.querySelector("[data-radix-scroll-area-viewport]");
            if (scrollElement) scrollElement.scrollTop = scrollElement.scrollHeight;
        }
    }, [messages]);

    const handleSend = async () => {
        if (!newMessage.trim() || !thread || !user) return;

        const tempId = `temp-${Date.now()}`;
        const optimisticMessage: ChatMessage = {
            id: tempId, thread: thread.id, body: newMessage,
            sender: { id: user.id, first_name: user.first_name, last_name: user.last_name, role: "USER" },
            created_at: new Date().toISOString(), attachments: [],
        };

        setMessages((prev) => [...prev, optimisticMessage]);
        const messageText = newMessage;
        setNewMessage("");

        try {
            const realMessage = await sendMessageApi(thread.id, messageText);
            setMessages((prev) => prev.map((m) => (m.id === tempId ? realMessage : m)));
        } catch (err) {
            setMessages((prev) => prev.filter((m) => m.id !== tempId));
            toast.error("ارسال پیام ناموفق بود");
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !thread || !user) return;

        const controller = new AbortController();
        setAbortController(controller);
        setIsUploading(true);
        setUploadProgress(0);

        try {
            const result = await uploadFile(file, {
                purpose: "chat_attachment", fileName: file.name,
                threadId: thread.id,
                onProgress: (percent) => setUploadProgress(percent), signal: controller.signal,
            });

            const tempId = `temp-file-${Date.now()}`;
            const optimisticMessage: ChatMessage = {
                id: tempId, thread: thread.id, body: "",
                sender: { id: user.id, first_name: user.first_name, last_name: user.last_name, role: "USER" },
                created_at: new Date().toISOString(),
                attachments: [{
                    asset_id: result.asset_id,
                    file_name: result.file_name,
                    file_size: result.file_size,
                    file_content_type: result.file_content_type,
                    state: result.state,
                    scan_status: result.scan_status,
                }],
            };

            setMessages((prev) => [...prev, optimisticMessage]);
            const realMessage = await sendMessageApi(thread.id, "", [result.asset_id]);
            setMessages((prev) => prev.map((m) => (m.id === tempId ? realMessage : m)));

        } catch (err: any) {
            if (err.message === 'آپلود فایل لغو شد') toast.info("آپلود فایل لغو شد");
            else toast.error(err.message || "آپلود فایل ناموفق بود");
        } finally {
            setIsUploading(false); setUploadProgress(0); setAbortController(null);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    const handleCancelUpload = () => abortController?.abort();

    if (!thread) {
        return (
            <div className="flex-1 hidden md:flex items-center justify-center text-gray-400 min-w-0">
                یک گفتگو را برای شروع انتخاب کنید
            </div>
        );
    }

    const otherUser = thread.participants?.find(p => p.role === "ADMIN") || thread.participants?.[0] || { first_name: "پشتیبانی", last_name: "", profile_picture: null, role: "ADMIN" };

    return (
        <div className="flex-1 flex flex-col h-full bg-white min-w-0">
            <div className="p-4 border-b border-gray-100 flex items-center gap-3 min-w-0">
                {onBack && (
                    <button onClick={onBack} className="md:hidden p-2 hover:bg-gray-100 rounded-full shrink-0">
                        <ArrowRight className="h-5 w-5" />
                    </button>
                )}
                <Avatar className="w-10 h-10 bg-[#E9F5F9] shrink-0">
                    <AvatarImage src={otherUser?.profile_picture || undefined} />
                    <AvatarFallback className="bg-[#E9F5F9] text-[#2993A3]"><Headset className="h-5 w-5" /></AvatarFallback>
                </Avatar>
                <h2 className="font-bold text-gray-800 truncate flex-1 min-w-0">پشتیبانی دنتو تایم</h2>
            </div>

            <ScrollArea ref={scrollAreaRef} className="flex-1 p-4 bg-[#F9FAFB]">
                {isLoading ? (
                    <div className="flex justify-center items-center h-full"><Loader2 className="h-6 w-6 animate-spin text-[#2993A3]" /></div>
                ) : (
                    messages.map((msg) => {
                        const senderId = typeof msg.sender === 'object' ? msg.sender?.id : msg.sender;
                        const isSender = String(senderId) === String(user?.id);
                        return <MessageBubble key={msg.id} message={msg} isSender={isSender} />;
                    })
                )}
            </ScrollArea>

            <div className="p-4 border-t border-gray-100 bg-white">
                {isUploading && (
                    <div className="mb-2 flex items-center gap-2">
                        <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                            <div className="h-full bg-[#2993A3] transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                        </div>
                        <span className="text-xs text-gray-500 w-10 text-left">{uploadProgress}%</span>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:bg-red-50" onClick={handleCancelUpload}>
                            <X className="h-4 w-4" />
                        </Button>
                    </div>
                )}
                <div className="flex items-center gap-2">
                    <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept="image/png,image/jpeg,image/webp,application/pdf,.stl,.ply,.obj" />
                    <Button variant="ghost" size="icon" onClick={() => fileInputRef.current?.click()} disabled={isUploading} className="rounded-full hover:bg-gray-100 shrink-0">
                        {isUploading ? <Loader2 className="h-5 w-5 animate-spin text-[#2993A3]" /> : <Paperclip className="h-5 w-5 text-gray-500" />}
                    </Button>
                    <Input value={newMessage} onChange={(e) => setNewMessage(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSend()} placeholder="پیام خود را بنویسید..." className="flex-1 min-w-0 rounded-full bg-gray-50 border-gray-200 focus:border-[#5FB4FF]" />
                    <Button onClick={handleSend} disabled={!newMessage.trim()} className="bg-[#2993A3] hover:bg-[#1f7b89] rounded-full w-10 h-10 p-0 shrink-0">
                        <Send className="h-5 w-5" />
                    </Button>
                </div>
            </div>
        </div>
    );
}
