"use client";

import React, { useState, useEffect, useCallback } from "react";
import { getThreads, deleteThreadApi, getOrCreateThread } from "@/lib/chat";
import { ChatThread } from "@/lib/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreVertical, Search, Trash2, ArrowRight, Plus, Headset } from "lucide-react";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

interface ChatListProps {
    onSelectThread: (thread: ChatThread) => void;
    activeThreadId: string | number | null;
    onBack?: () => void;
}

export default function UserChatList({ onSelectThread, activeThreadId, onBack }: ChatListProps) {
    const [threads, setThreads] = useState<ChatThread[]>([]);
    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");

    useEffect(() => {
        const handler = setTimeout(() => setDebouncedSearch(search), 500);
        return () => clearTimeout(handler);
    }, [search]);

    const fetchThreads = useCallback(async () => {
        try {
            const data = await getThreads(debouncedSearch);
            let filteredData = data;
            if (debouncedSearch.trim() !== "") {
                filteredData = data.filter((thread: any) => {
                    const otherUser = thread.participants?.find((p: any) => p.role === "ADMIN") || thread.participants?.[0];
                    const fullName = `${otherUser?.first_name || ""} ${otherUser?.last_name || ""}`.toLowerCase();
                    return fullName.includes(debouncedSearch.toLowerCase());
                });
            }
            setThreads(filteredData);
        } catch (err) {
            console.error("Failed to fetch threads", err);
        }
    }, [debouncedSearch]);

    useEffect(() => {
        fetchThreads();
        const interval = setInterval(fetchThreads, 5000);
        return () => clearInterval(interval);
    }, [fetchThreads]);

    const handleDelete = async (e: React.MouseEvent, threadId: string) => {
        e.stopPropagation();
        try {
            await deleteThreadApi(threadId);
            setThreads((prev) => prev.filter((t) => t.id !== threadId));
        } catch (err) {
            console.error("Failed to delete thread", err);
        }
    };

    const handleNewChat = async () => {
        try {
            const newThread = await getOrCreateThread();
            setThreads((prev) => prev.some(t => t.id === newThread.id) ? prev : [newThread, ...prev]);
            onSelectThread(newThread);
        } catch (err) {
            toast.error("ساخت گفتگو جدید ناموفق بود");
        }
    };

    return (
        <div className="w-full h-full bg-white border-l border-gray-100 flex flex-col">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    {onBack && (
                        <button onClick={onBack} className="md:hidden p-2 hover:bg-gray-100 rounded-full">
                            <ArrowRight className="h-5 w-5" />
                        </button>
                    )}
                    <h2 className="text-lg font-bold text-gray-800">گفت و گو ها</h2>
                </div>
                <button
                    onClick={handleNewChat}
                    className="flex items-center gap-1 rounded-full bg-[#E9F5F9] px-3 py-1.5 text-xs font-medium text-[#2993A3] hover:bg-[#d8eef5] transition-colors"
                >
                    <Plus className="h-4 w-4" />
                    گفتگوی جدید
                </button>
            </div>

            <div className="p-4">
                <div className="relative">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                        placeholder="جستجو..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pr-10 bg-gray-50 border-gray-200 focus:border-[#5FB4FF]"
                    />
                </div>
            </div>

            <ScrollArea className="flex-1">
                {threads.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full p-4 text-center">
                        <p className="text-gray-400 text-sm">گفتگویی یافت نشد</p>
                        <p className="text-gray-300 text-xs mt-1">برای شروع، روی گفتگوی جدید کلیک کنید.</p>
                    </div>
                ) : (
                    threads.map((thread) => {
                        // برای کاربر، طرف مقابل همیشه ادمین است
                        const otherUser = thread.participants?.find(p => p.role === "ADMIN") || thread.participants?.[0] || { first_name: "پشتیبانی", last_name: "", profile_picture: null };

                        return (
                            <div key={thread.id} className="w-full">
                                <div
                                    onClick={() => onSelectThread(thread)}
                                    className={cn(
                                        "flex w-full items-center gap-3 p-3 cursor-pointer transition-colors group",
                                        activeThreadId === thread.id ? "bg-[#F5FAFF]" : "hover:bg-gray-50"
                                    )}
                                >

                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <button onClick={(e) => e.stopPropagation()} className="p-2 rounded-full hover:bg-gray-200 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                                                <MoreVertical className="h-4 w-4 text-gray-500" />
                                            </button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem onClick={(e) => handleDelete(e, thread.id)} className="text-red-500 focus:text-red-500 cursor-pointer">
                                                <Trash2 className="h-4 w-4 ml-2" />
                                                حذف گفتگو
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>

                                    {thread.unread_count > 0 && (
                                        <span className="bg-[#2993A3] text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0">
                                            {thread.unread_count}
                                        </span>
                                    )}

                                    <div className="flex-1 min-w-0 text-right">
                                        <h3 className="font-semibold text-gray-800 text-sm truncate">
                                            پشتیبانی دنتو تایم
                                        </h3>
                                        {/* <p className="text-xs text-gray-500 truncate"> */}
                                            {/* {thread.last_message || "بدون پیام"} */}
                                        {/* </p> */}
                                    </div>

                                    <Avatar className="w-12 h-12 border border-gray-200 flex-shrink-0 bg-[#E9F5F9]">
                                        <AvatarImage src={otherUser?.profile_picture || undefined} />
                                        <AvatarFallback className="bg-[#E9F5F9] text-[#2993A3]">
                                            <Headset className="h-5 w-5" />
                                        </AvatarFallback>
                                    </Avatar>
                                </div>
                                <Separator className="w-full bg-gray-100" />
                            </div>
                        );
                    })
                )}
            </ScrollArea>
        </div>
    );
}