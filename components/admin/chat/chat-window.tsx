"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { getMessages, sendMessageApi, markThreadRead } from "@/lib/chat";
import { uploadFile } from "@/lib/upload";
import { ChatThread, ChatMessage } from "@/lib/types";
import MessageBubble from "./message-bubble";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Paperclip, ArrowRight, Loader2 } from "lucide-react";

interface ChatWindowProps {
    thread: ChatThread | null;
    onBack?: () => void;
}

export default function ChatWindow({ thread, onBack }: ChatWindowProps) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [newMessage, setNewMessage] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const scrollAreaRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [currentUserId, setCurrentUserId] = useState<string>("");

    useEffect(() => {
        const userStr = localStorage.getItem("user");
        if (userStr) {
            try {
                const user = JSON.parse(userStr);
                setCurrentUserId(user.id);
            } catch (e) {
                console.error("Failed to parse user from localStorage", e);
            }
        }
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
        } catch (err) {
            console.error(err);
        }
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
        if (!newMessage.trim() || !thread) return;

        const tempId = `temp-${Date.now()}`;
        const optimisticMessage: ChatMessage = {
            id: tempId,
            thread: thread.id,
            body: newMessage,
            sender: { id: "admin", first_name: "Admin", last_name: "", phone_number: "", role: "ADMIN" },
            attachments: [],
            created_at: new Date().toISOString(),
        };

        setMessages((prev) => [...prev, optimisticMessage]);
        const messageText = newMessage;
        setNewMessage("");

        try {
            const realMessage = await sendMessageApi(thread.id, messageText);
            setMessages((prev) => prev.map((m) => (m.id === tempId ? realMessage : m)));
        } catch (err) {
            setMessages((prev) => prev.filter((m) => m.id !== tempId));
            console.error("Failed to send message", err);
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !thread) return;

        setIsUploading(true);
        setUploadProgress(0);
        
        try {
            const result = await uploadFile(file, {
                purpose: "chat_attachment",
                fileName: file.name,
                onProgress: (percent) => setUploadProgress(percent)
            });

            const tempId = `temp-file-${Date.now()}`;
            const optimisticMessage: ChatMessage = {
                id: tempId,
                thread: thread.id,
                body: "",
                sender: { id: "admin", first_name: "Admin", last_name: "", phone_number: "", role: "ADMIN" },
                created_at: new Date().toISOString(),
                attachments: [{
                    file_url: result.file_url,
                    file_name: result.file_name,
                    file_size: result.file_size,
                    file_key: result.file_key,
                    file_content_type: result.file_content_type,
                }],
            };

            setMessages((prev) => [...prev, optimisticMessage]);

            const realMessage = await sendMessageApi(thread.id, "", [{
                file_url: result.file_url,
                file_name: result.file_name,
                file_size: result.file_size,
                file_key: result.file_key,
                file_content_type: result.file_content_type
            }]);
            
            setMessages((prev) => prev.map((m) => (m.id === tempId ? realMessage : m)));

        } catch (err: any) {
            console.error("File upload failed", err);
            alert(err.message || "خطا در آپلود فایل");
        } finally {
            setIsUploading(false);
            setUploadProgress(0);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    if (!thread) {
        return (
            <div className="flex-1 hidden md:flex items-center justify-center text-gray-400">
                یک گفتگو را برای شروع انتخاب کنید
            </div>
        );
    }

    // پشتیبانی از هر دو فیلد participant و participants
    const otherUser = thread.participant || (thread.participants && thread.participants[0]) || { first_name: "کاربر", last_name: "ناشناس", profile_picture: null };
    const avatarSrc = otherUser?.profile_picture && otherUser.profile_picture.trim() !== "" ? otherUser.profile_picture : undefined;

    return (
        <div className="flex-1 flex flex-col h-full bg-white">
            {/* Header */}
            <div className="p-4 border-b border-gray-100 flex items-center gap-3">
                {onBack && (
                    <button onClick={onBack} className="md:hidden p-2 hover:bg-gray-100 rounded-full">
                        <ArrowRight className="h-5 w-5" />
                    </button>
                )}
                <Avatar className="w-10 h-10">
                    <AvatarImage src={avatarSrc} />
                    <AvatarFallback>{otherUser?.first_name?.[0] || "?"}</AvatarFallback>
                </Avatar>
                <h2 className="font-bold text-gray-800">{otherUser?.first_name} {otherUser?.last_name}</h2>
            </div>

            {/* Messages */}
            <ScrollArea ref={scrollAreaRef} className="flex-1 p-4 bg-[#F9FAFB]">
                {isLoading ? (
                    <div className="flex justify-center items-center h-full">
                        <Loader2 className="h-6 w-6 animate-spin text-[#2993A3]" />
                    </div>
                ) : (
                    messages.map((msg) => {
                        const senderId = typeof msg.sender === 'object' ? msg.sender?.id : msg.sender;
                        const isSender = senderId === currentUserId;

                        return (
                            <MessageBubble
                                key={msg.id}
                                message={msg}
                                isSender={isSender}
                            />
                        );
                    })
                )}
            </ScrollArea>

            {/* Input */}
            <div className="p-4 border-t border-gray-100 bg-white">
                <div className="flex items-center gap-2">
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileUpload}
                        className="hidden"
                    />
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                        className="rounded-full hover:bg-gray-100 relative"
                    >
                        {isUploading ? (
                            <>
                                <Loader2 className="h-5 w-5 animate-spin text-[#2993A3]" />
                                <span className="absolute -bottom-5 text-[10px] font-bold text-[#2993A3]">{uploadProgress}%</span>
                            </>
                        ) : (
                            <Paperclip className="h-5 w-5 text-gray-500" />
                        )}
                    </Button>

                    <Input
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleSend()}
                        placeholder="پیام خود را بنویسید..."
                        className="flex-1 rounded-full bg-gray-50 border-gray-200 focus:border-[#5FB4FF]"
                    />

                    <Button
                        onClick={handleSend}
                        disabled={!newMessage.trim()}
                        className="bg-[#2993A3] hover:bg-[#1f7b89] rounded-full w-10 h-10 p-0"
                    >
                        <Send className="h-5 w-5" />
                    </Button>
                </div>
            </div>
        </div>
    );
}
