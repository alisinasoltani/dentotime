"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import {
    MessageSquare,
    UserCheck,
    CalendarDays,
    Stethoscope,
    Users,
    LogOut,
    UserCog,
    PanelLeftClose,
    CalendarPlus,
} from "lucide-react";
import { useState, useEffect } from "react";
import api from "@/lib/api";
import Image from "next/image";
import { clearTokens } from "@/lib/auth";

const navItems = [
    { title: "گفت و گو ها", href: "/admin/chat", icon: MessageSquare },
    { title: "درخواست ها", href: "/admin/requests", icon: UserCheck },
    { title: "لیست رزرو کاربران", href: "/admin/appointments", icon: CalendarDays },
    { title: "مدیریت زمان‌ها", href: "/admin/slots", icon: CalendarPlus },
    { title: "لیست پزشکان", href: "/admin/doctors", icon: Stethoscope },
    { title: "لیست کاربران", href: "/admin/users", icon: Users },
];

export default function AdminSidebar({ onClose }: { onClose?: () => void }) {
    const pathname = usePathname();
    const router = useRouter();
    const [isLoggingOut, setIsLoggingOut] = useState(false);
    const [adminUser, setAdminUser] = useState<any>(null);

    useEffect(() => {
        const fetchAdminData = async () => {
            try {
                const res = await api.get("/users/me/");
                setAdminUser(res.data);
            } catch (err) {
                console.error("Failed to fetch admin data", err);
            }
        };
        fetchAdminData();
    }, []);

    const handleLogout = async () => {
        setIsLoggingOut(true);
        try {
            await api.post("/auth/logout/");
            clearTokens();
            router.push("/admin/login");
        } catch (error) {
            console.error("Logout failed", error);
        } finally {
            setIsLoggingOut(false);
        }
    };

    const fallbackChar = adminUser?.first_name ? adminUser.first_name[0] : "ا";
    const avatarSrc = adminUser?.profile_picture && adminUser.profile_picture.trim() !== "" ? adminUser.profile_picture : undefined;

    return (
        <div className="flex items-center gap-0 py-4 pr-4 h-full">
            <div className="flex h-full flex-col bg-white border border-[#5FB4FF] rounded-2xl w-72 p-4">
                <div className="flex justify-center items-center gap-4">
                    <div className="w-10 h-10 md:h-12 md:w-12 rounded-md flex items-center justify-center text-gray-400 text-sm mb-4">
                        <Image src={"/images/logo.png"} alt="" width={48} height={48} />
                    </div>

                    <div className="flex items-center justify-between mb-4">
                        <h1 className="text-md md:text-lg font-bold text-gray-800">پنل ادمین دنتو تایم</h1>
                        {onClose && (
                            <Button variant="ghost" size="icon" onClick={onClose} className="lg:hidden">
                                <PanelLeftClose className="h-5 w-5" />
                            </Button>
                        )}
                    </div>
                </div>

                <Separator className="my-2 bg-[#C0C0C0]" />

                <div className="flex justify-center items-center gap-4 py-4">
                    <Avatar className="w-14 h-14 border-2 border-[#5FB4FF]">
                        <AvatarImage src={avatarSrc} alt="Admin Avatar" />
                        <AvatarFallback>{fallbackChar}</AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col justify-center items-start gap-1">
                        <p className="text-sm text-black font-medium">
                            {adminUser ? `${adminUser.first_name || ""} ${adminUser.last_name || ""}`.trim() : "در حال بارگذاری..."}
                        </p>
                        <Button
                            variant="outline"
                            size="sm"
                            className="mt-2 border-[#5FB4FF] text-[#2993A3] hover:bg-[#D4EBF3] hover:text-[#2993A3] cursor-pointer"
                            onClick={() => router.push("/admin/edit-info")}
                        >
                            <UserCog className="ml-2 h-4 w-4" />
                            ویرایش اطلاعات
                        </Button>
                    </div>
                </div>

                <nav className="flex flex-col gap-2 grow">
                    {navItems.map((item) => {
                        const isActive = pathname === item.href;
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                onClick={onClose}
                                className={`flex items-center gap-3 px-4 py-3 rounded-md transition-all duration-200 ${
                                    isActive
                                        ? "bg-gradient-to-l from-[#FFFFFF] to-[#D4EBF3] text-[#2993A3] font-semibold"
                                        : "text-gray-600 hover:bg-gray-50"
                                }`}
                            >
                                <item.icon className={`h-5 w-5 ${isActive ? "text-[#2993A3]" : "text-gray-500"}`} />
                                <span>{item.title}</span>
                            </Link>
                        );
                    })}
                </nav>

                <div className="mt-auto pt-4">
                    <Button
                        variant="ghost"
                        className="w-full justify-start text-red-500 hover:bg-red-50 hover:text-red-600"
                        onClick={handleLogout}
                        disabled={isLoggingOut}
                    >
                        <LogOut className="ml-2 h-5 w-5" />
                        {isLoggingOut ? "در حال خروج..." : "خروج از حساب کاربری"}
                    </Button>
                </div>
            </div>
        </div>
    );
}
