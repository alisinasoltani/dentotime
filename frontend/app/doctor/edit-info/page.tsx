// app/doctor/edit-info/page.tsx
"use client";
import { PublicProfileForm } from "@/components/doctor/public-profile-form";

import { useState, useCallback, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import { uploadFile } from "@/lib/upload";
import api from "@/lib/api";
import { useDoctorContext } from "@/context/doctor-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PasswordChangeForm } from "@/components/auth/password-change-form";
import { UploadCloud, Loader2, UserCog } from "lucide-react";
import { sanitizeText } from "@/lib/sanitize";

const CropImageModal = dynamic(() => import("@/components/shared/crop-image-modal"), {
    ssr: false,
});

export default function EditDoctorInfoPage() {
    const { user, refetchUser } = useDoctorContext();

    // State های مربوط به عکس پروفایل
    const [imageSrc, setImageSrc] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [profilePicUrl, setProfilePicUrl] = useState<string | null>(null);

    // State های مربوط به اطلاعات کاربری
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [username, setUsername] = useState("");
    const [isSavingProfile, setIsSavingProfile] = useState(false);
    const [profileSuccess, setProfileSuccess] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const localProfileUrlRef = useRef<string | null>(null);

    useEffect(() => {
        return () => {
            if (localProfileUrlRef.current) URL.revokeObjectURL(localProfileUrlRef.current);
        };
    }, []);

    // همگام‌سازی اطلاعات کاربر از Context با State های محلی
    useEffect(() => {
        if (user) {
            setFirstName(user.first_name || "");
            setLastName(user.last_name || "");
            setUsername((user as any).username || ""); // username might not be explicitly typed
            setProfilePicUrl(user.profile_picture || null);
        }
    }, [user]);

    // --- توابع مربوط به آپلود عکس پروفایل ---
    const validateFile = (file: File): boolean => {
        setError(null);
        const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
        if (!allowedTypes.includes(file.type)) {
            setError("فقط فایل‌های تصویری (JPEG, PNG, WEBP) مجاز هستند.");
            return false;
        }
        const maxSize = 2 * 1024 * 1024;
        if (file.size > maxSize) {
            setError("حجم عکس بارگذاری شده نباید بیشتر از 2 مگابایت باشد.");
            return false;
        }
        return true;
    };

    const onFileSelect = (file: File | undefined) => {
        if (!file || !validateFile(file)) return;
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            setImageSrc(reader.result as string);
            setIsModalOpen(true);
        };
    };

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        onFileSelect(e.dataTransfer.files?.[0]);
    }, []);

    const handleCropComplete = async (croppedBlob: Blob) => {
        setIsModalOpen(false);
        setIsUploading(true);
        setError(null);
        try {
            // Section 8.2: استفاده از تابع core شده uploadFile با purpose مربوطه
            const imgFile = new File([croppedBlob], `profile-${Date.now()}.jpg`, { type: 'image/jpeg' });
            const result = await uploadFile(imgFile, {
                purpose: 'profile_picture',
                fileName: imgFile.name,
            });

            // آپدیت پروفایل در دیتابیس
            await api.patch("/users/me/", {
                profile_picture_asset_id: result.asset_id,
            });

            if (localProfileUrlRef.current) URL.revokeObjectURL(localProfileUrlRef.current);
            const localProfileUrl = URL.createObjectURL(croppedBlob);
            localProfileUrlRef.current = localProfileUrl;
            setProfilePicUrl(localProfileUrl);

            // Section 8.5: رفرش کردن داده‌های سایدبار
            await refetchUser();

        } catch (err: any) {
            setError(err.message || "خطا در آپلود تصویر. لطفا دوباره تلاش کنید.");
        } finally {
            setIsUploading(false);
        }
    };

    // --- تابع ذخیره تغییرات اطلاعات کاربری ---
    const handleSaveProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSavingProfile(true);
        setProfileSuccess(false);
        try {
            // Sanitize all free-text inputs before sending to the API
            await api.patch("/users/me/", {
                first_name: sanitizeText(firstName),
                last_name: sanitizeText(lastName),
                username: sanitizeText(username),
            });

            // Section 8.5: Refresh sidebar data
            await refetchUser();

            setProfileSuccess(true);
            setTimeout(() => setProfileSuccess(false), 3000);
        } catch (err) {
            setError("ذخیره تغییرات ناموفق بود.");
        } finally {
            setIsSavingProfile(false);
        }
    };

    return (
        <div className="w-full mx-auto max-w-4xl space-y-8 bg-white rounded-2xl border border-gray-100 p-4 md:p-8">

            {/* بخش تغییرات حساب کاربری و عکس پروفایل */}
            <div>
                <h1 className="text-2xl font-bold text-gray-800 mb-8 flex items-center gap-2">
                    <UserCog className="text-[#2993A3]" />
                    تغییرات حساب
                </h1>

                {/* قسمت عکس پروفایل */}
                <div className="mb-8">
                    <h2 className="text-lg font-semibold text-gray-700 mb-1">عکس پروفایل:</h2>
                    <p className="text-sm text-gray-500 mb-4">حجم عکس بارگذاری شده نباید بیشتر از 2 مگابایت باشد.</p>

                    {error && (
                        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg w-full">
                            {error}
                        </div>
                    )}

                    <div className="flex flex-col md:flex-row items-center gap-6">
                        {/* Section 8.3: AvatarFallback showing doctor's first initial */}
                        <Avatar className="w-24 h-24 border-2 border-[#5FB4FF]">
                            <AvatarImage src={profilePicUrl || undefined} />
                            <AvatarFallback className="bg-[#E9F5F9] text-[#2993A3] text-2xl font-bold">
                                {firstName?.charAt(0) || 'پ'}
                            </AvatarFallback>
                        </Avatar>

                        <div
                            onDrop={handleDrop}
                            onDragOver={(e) => e.preventDefault()}
                            onClick={() => fileInputRef.current?.click()}
                            className="flex-1 w-full border-2 border-dashed border-[#5FB4FF] rounded-xl p-6 text-center cursor-pointer hover:bg-[#F5FAFF] transition-colors"
                        >
                            {isUploading ? (
                                <div className="flex flex-col items-center text-[#2993A3]">
                                    <Loader2 className="h-8 w-8 animate-spin mb-2" />
                                    <span className="text-sm">در حال آپلود...</span>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center text-gray-500">
                                    <UploadCloud className="h-8 w-8 mb-2 text-[#5FB4FF]" />
                                    <span className="text-sm font-medium">تصویر را اینجا رها کنید یا کلیک کنید</span>
                                    <span className="text-xs text-gray-400 mt-1">JPEG, PNG, WEBP</span>
                                </div>
                            )}
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/png, image/jpeg, image/webp"
                                className="hidden"
                                onChange={(e) => onFileSelect(e.target.files?.[0])}
                            />
                        </div>
                    </div>
                </div>

                {/* فرم اطلاعات کاربری */}
                <form onSubmit={handleSaveProfile} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <Label htmlFor="firstName">نام</Label>
                            <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} className="border-gray-200 focus:border-[#5FB4FF]" />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="lastName">نام خانوادگی</Label>
                            <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} className="border-gray-200 focus:border-[#5FB4FF]" />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="username">نام کاربری</Label>
                        <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} className="border-gray-200 focus:border-[#5FB4FF]" />
                    </div>

                    {profileSuccess && <p className="text-green-600 text-sm">تغییرات با موفقیت ذخیره شد.</p>}

                    <Button type="submit" disabled={isSavingProfile} className="bg-[#2993A3] hover:bg-[#1f7b89]">
                        {isSavingProfile ? "در حال ذخیره..." : "ثبت تغییرات"}
                    </Button>
                </form>
            </div>

            <PublicProfileForm />

            {/* بخش تغییر رمز عبور */}
            <PasswordChangeForm />

            <CropImageModal
                imageSrc={imageSrc}
                open={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onCropComplete={handleCropComplete}
            />
        </div>
    );
}
