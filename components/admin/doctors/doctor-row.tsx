"use client";

import React from "react";
import { Doctor } from "@/lib/doctors";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreVertical, Trash2, Eye, Stethoscope, CheckCircle, Clock, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns-jalali"; // برای نمایش شمسی

interface Props {
  doctor: Doctor;
  onDeactivate: (doctor: Doctor) => void;
  onViewDocs: (doctor: Doctor, name: string) => void;
  onViewRatings: (doctor: Doctor, name: string) => void;
}

const DoctorRow = React.memo(({ doctor, onDeactivate, onViewDocs, onViewRatings }: Props) => {
  // ایمن‌سازی در برابر undefined
  const user = doctor.user || (doctor as any);
  const firstName = user.first_name || "";
  const lastName = user.last_name || "";
  const username = user.username || "نامشخص";
  const profilePicture = user.profile_picture || undefined;
  const fullName = `${firstName} ${lastName}`.trim() || "پزشک ناشناس";

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4 flex flex-col md:flex-row md:items-center gap-4 transition-shadow hover:shadow-sm">
      {/* User Info */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <Avatar className="w-12 h-12 border border-gray-200 flex-shrink-0">
          <AvatarImage src={profilePicture} />
          <AvatarFallback>{firstName?.[0] || "D"}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <h3 className="font-semibold text-gray-800 text-sm truncate flex items-center gap-1.5">
            <Stethoscope className="h-3.5 w-3.5 text-[#2993A3]" />
            {fullName}
          </h3>
          <p className="text-xs text-gray-500 truncate">@{username}</p>
        </div>
      </div>

      {/* Verification Status & Date */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <button type="button" onClick={() => onViewRatings(doctor, fullName)} className="flex items-center gap-1 rounded-full bg-yellow-50 px-3 py-1 text-xs font-semibold text-yellow-700 hover:bg-yellow-100">
          <Star className="h-3.5 w-3.5" fill="currentColor" />
          {Number(doctor.average_rating || 0).toFixed(1)} از ۵ ({doctor.vote_count || 0} رأی)
        </button>
        {doctor.verification_status === "APPROVED" && (
          <div className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-3 py-1 rounded-full">
            <CheckCircle className="h-3 w-3" />
            {doctor.verification_date ? `تایید شده در ${format(new Date(doctor.verification_date), "yyyy/MM/dd")}` : "تایید شده"}
          </div>
        )}
        {doctor.verification_status === "PENDING" && (
          <div className="flex items-center gap-1 text-xs text-yellow-600 bg-yellow-50 px-3 py-1 rounded-full">
            <Clock className="h-3 w-3" />
            در انتظار بررسی
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <Button
          variant="outline"
          size="sm"
          className="border-gray-200 text-gray-600 hover:bg-gray-50"
          // جستجو در تمام فیلدهای احتمالی که بک‌اند ممکن است استفاده کند
          onClick={() => onViewDocs(doctor, fullName)}
        >
          <Eye className="h-4 w-4 ml-1" />
          مشاهده مدارک
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full hover:bg-gray-100">
              <MoreVertical className="h-5 w-5 text-gray-500" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => onDeactivate(doctor)}
              className="text-red-500 focus:text-red-500 cursor-pointer"
            >
              <Trash2 className="h-4 w-4 ml-2" />
              حذف حساب کاربری
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
});
DoctorRow.displayName = "DoctorRow";
export default DoctorRow;
