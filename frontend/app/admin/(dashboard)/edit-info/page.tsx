"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import CropImageModal from "@/components/admin/crop-image-modal";
import { uploadProfilePicture } from "@/lib/upload"; // این تابع درون خود از سیستم جدید استفاده می‌کند
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { UploadCloud, Loader2, Lock, UserCog } from "lucide-react";

export default function EditInfoPage() {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [profilePicUrl, setProfilePicUrl] = useState<string | null>(null);
  
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(false);

  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const res = await api.get("/users/me/");
        const user = res.data;
        setFirstName(user.first_name || "");
        setLastName(user.last_name || "");
        setUsername(user.username || "");
        setProfilePicUrl(user.profile_picture || null);
      } catch (err) {
        console.error("Failed to fetch user data", err);
      }
    };
    fetchUserData();
  }, []);

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
      const fileName = `profile-${Date.now()}.jpg`;
      // این تابع درون خود در فایل lib/upload.ts به سیستم جدید آپلود مستقیم ارتقا یافته است
      const newPicUrl = await uploadProfilePicture(croppedBlob, fileName);
      setProfilePicUrl(newPicUrl);
    } catch (err: any) {
      setError(err.message || "خطا در آپلود تصویر. لطفا دوباره تلاش کنید.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingProfile(true);
    setProfileSuccess(false);
    try {
      await api.patch("/users/me/", {
        first_name: firstName,
        last_name: lastName,
        username: username,
      });
      setProfileSuccess(true);
      setTimeout(() => setProfileSuccess(false), 3000);
    } catch (err) {
      setError("ذخیره تغییرات ناموفق بود.");
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(false);

    if (newPassword !== confirmPassword) {
      setPasswordError("رمز عبور جدید و تکرار آن یکسان نیستند.");
      return;
    }

    setIsChangingPassword(true);
    try {
      await api.post("/users/me/change-password/", {
        old_password: oldPassword,
        new_password: newPassword,
      });
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordSuccess(true);
      setTimeout(() => setPasswordSuccess(false), 3000);
    } catch (err: any) {
      const errMsg = err.response?.data?.old_password?.[0] || err.response?.data?.detail || "خطا در تغییر رمز عبور.";
      setPasswordError(errMsg);
    } finally {
      setIsChangingPassword(false);
    }
  };

  return (
    <div className="w-full mx-auto space-y-8 bg-white rounded-2xl border border-gray-100">
      
      <div className="bg-white rounded-2xl p-4 md:p-8">
        <h1 className="text-xl md:text-2xl font-bold text-gray-800 mb-8 flex items-center gap-2">
          <UserCog className="text-[#2993A3]" />
          تغییرات حساب
        </h1>

        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-700 mb-1">عکس پروفایل:</h2>
          <p className="text-sm text-gray-500 mb-4">حجم عکس بارگذاری شده نباید بیشتر از 2 مگابایت باشد.</p>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg w-full">
              {error}
            </div>
          )}

          <div className="flex flex-col md:flex-row items-center gap-6">
            <Avatar className="w-24 h-24 border-2 border-[#5FB4FF] shrink-0">
              <AvatarImage src={profilePicUrl || undefined} />
              <AvatarFallback>ادمین</AvatarFallback>
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

      <div className="bg-white rounded-2xl px-4 md:px-8 pb-8">
        <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
          <Lock className="text-[#2993A3]" />
          تغییر رمز عبور
        </h2>

        {passwordError && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg">{passwordError}</div>}
        {passwordSuccess && <p className="mb-4 text-green-600 text-sm">رمز عبور با موفقیت تغییر کرد.</p>}

        <form onSubmit={handleChangePassword} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="old_password">رمز عبور فعلی</Label>
            <Input id="old_password" type="password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} required className="border-gray-200 focus:border-[#5FB4FF]" />
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="new_password">رمز عبور جدید</Label>
              <Input id="new_password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required className="border-gray-200 focus:border-[#5FB4FF]" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm_password">تکرار رمز عبور جدید</Label>
              <Input id="confirm_password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required className="border-gray-200 focus:border-[#5FB4FF]" />
            </div>
          </div>

          <Button type="submit" disabled={isChangingPassword} variant="outline" className="border-[#2993A3] text-[#2993A3] hover:bg-[#F5FAFF]">
            {isChangingPassword ? "در حال تغییر..." : "تغییر رمز عبور"}
          </Button>
        </form>
      </div>

      <CropImageModal 
        imageSrc={imageSrc}
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onCropComplete={handleCropComplete}
      />
    </div>
  );
}