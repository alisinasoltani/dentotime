"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { getThreads, deleteThreadApi } from "@/lib/chat";
import { ChatThread } from "@/lib/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreVertical, Search, Trash2, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";

interface ChatListProps {
    onSelectThread: (thread: ChatThread) => void;
    activeThreadId: string | null;
    onBack?: () => void;
}

export default function ChatList({ onSelectThread, activeThreadId, onBack }: ChatListProps) {
    const [threads, setThreads] = useState<ChatThread[]>([]);
    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [activeCategory, setActiveCategory] = useState<'all' | 'unread' | 'doctors' | 'users'>('all');

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
                    const p = thread.participant || {};
                    const fullName = `${p.first_name || ""} ${p.last_name || ""}`.toLowerCase();
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

    const categorizedThreads = useMemo(() => {
        return threads.filter((thread: any) => {
            const role = thread.participant?.role;
            if (activeCategory === 'unread') return thread.unread_count > 0;
            if (activeCategory === 'doctors') return role === 'DOCTOR';
            if (activeCategory === 'users') return role === 'USER';
            return true;
        });
    }, [threads, activeCategory]);

    const categories = [
        { id: 'all', label: 'همه' },
        { id: 'unread', label: 'خوانده نشده' },
        { id: 'doctors', label: 'پزشکان' },
        { id: 'users', label: 'کاربران' },
    ] as const;

    return (
        <div className="w-full md:w-87.5 h-full bg-white border-l border-gray-100 flex flex-col">
            <div className="p-4 border-b border-gray-100 flex items-center gap-2">
                {onBack && (
                    <button onClick={onBack} className="md:hidden p-2 hover:bg-gray-100 rounded-full">
                        <ArrowRight className="h-5 w-5" />
                    </button>
                )}
                <h2 className="text-lg font-bold text-gray-800">گفت و گو ها</h2>
            </div>

            <div className="p-4 pb-2">
                <div className="relative">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                        placeholder="جستجوی کاربر..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pr-10 bg-gray-50 border-gray-200 focus:border-[#5FB4FF]"
                    />
                </div>
            </div>

            <div className="flex w-full justify-between gap-1 px-4 pb-2 border-b border-gray-100 overflow-x-auto scrollbar-hide">
                {categories.map((cat) => (
                    <button
                        key={cat.id}
                        onClick={() => setActiveCategory(cat.id)}
                        className={cn(
                            "px-4 py-2 text-xs font-bold transition-colors whitespace-nowrap border-b-2 -mb-px",
                            activeCategory === cat.id
                                ? "border-[#2993A3] text-[#2993A3]"
                                : "border-transparent text-gray-500 hover:text-gray-800"
                        )}
                    >
                        {cat.label}
                    </button>
                ))}
            </div>

            <ScrollArea className="flex-1 overflow-y-scroll">
                {categorizedThreads.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full p-4 text-center">
                        <p className="text-gray-400 text-sm">
                            {debouncedSearch ? "نتیجه‌ای یافت نشد" : "گفتگویی یافت نشد"}
                        </p>
                        <p className="text-gray-300 text-xs mt-1">
                            {debouncedSearch ? "عبارت دیگری را جستجو کنید" : "هنگام دریافت پیام از کاربران، اینجا نمایش داده می‌شود."}
                        </p>
                    </div>
                ) : (
                    categorizedThreads.map((thread: any) => {
                        const otherUser = thread.participant || { first_name: "کاربر", last_name: "ناشناس", profile_picture: null, role: "USER" };
                        const fullName = `${otherUser?.first_name || ""} ${otherUser?.last_name || ""}`.trim() || "کاربر ناشناس";
                        const isDoctor = otherUser.role === 'DOCTOR';
                        const avatarSrc = otherUser?.profile_picture && otherUser.profile_picture.trim() !== "" ? otherUser.profile_picture : undefined;

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
                                            <button onClick={(e) => e.stopPropagation()} className="p-2 rounded-full hover:bg-gray-200 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                                                <MoreVertical className="h-4 w-4 text-black" />
                                            </button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="w-full">
                                            <DropdownMenuItem onClick={(e) => handleDelete(e, thread.id)} className="flex gap-2 text-red-500 focus:text-red-500 cursor-pointer">
                                                <Trash2 className="h-4 w-4 ml-2" />
                                                    حذف کامل گفتگو
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>

                                    {thread.unread_count > 0 && (
                                        <span className="bg-[#2993A3] text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0">
                                            {thread.unread_count}
                                        </span>
                                    )}

                                    <div className="flex-1 min-w-0 text-righ">
                                        <div className="flex justify-end items-center gap-2 text-right">
                                            <span className={cn(
                                                "text-[10px] px-1.5 py-0.5 rounded-full font-bold flex-shrink-0",
                                                isDoctor ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"
                                            )}>
                                                {isDoctor ? 'پزشک' : 'کاربر'}
                                            </span>
                                            <h3 className="font-semibold text-gray-800 text-sm truncate text-right">
                                                {fullName}
                                            </h3>
                                        </div>
                                    </div>

                                    <Avatar className="w-12 h-12 border border-gray-200 flex-shrink-0">
                                        <AvatarImage src={avatarSrc} />
                                        <AvatarFallback>
                                            {otherUser?.first_name?.[0] || "?"}
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