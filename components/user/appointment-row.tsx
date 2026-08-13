"use client";

import React from "react";
import { Appointment, getAppointmentDate } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Clock, Calendar, Trash2, CheckCircle, XCircle, Hourglass } from "lucide-react";
import { cn } from "@/lib/utils";
import { format as jFormat } from "date-fns-jalali";
import { toast } from "sonner";

interface Props {
  appointment: Appointment;
  onCancel: (id: string) => Promise<void>; // تغییر نوع به Promise
}

const AppointmentRow = React.memo(({ appointment, onCancel }: Props) => {
  const dateObj = getAppointmentDate(appointment);
  if (!dateObj) return null;

  const status = appointment.status;
  let userNote = "";
  if (appointment.admin_notes) {
    const parts = appointment.admin_notes.split("|");
    userNote = parts[0]?.replace("یادداشت کاربر:", "").trim() || appointment.admin_notes;
  }

  const handleCancelClick = async () => {
    try {
      await onCancel(appointment.id);
    } catch (err: any) {
      // بررسی اینکه آیا خطای 403 (Forbidden) از سرور برگشته است یا خیر
      if (err.response?.status === 403) {
        toast.error("نوبت نهایتا تا 24 ساعت قبل قابل لغو کردن است، در صورت بروز مشکل ضروری، لطفا با شماره 021-12345678 تماس بگیرید.");
      } else {
        toast.error("خطا در لغو نوبت. لطفا دوباره تلاش کنید.");
      }
    }
  };

  return (
    <div className={cn(
      "bg-white border rounded-xl p-4 flex flex-col gap-4 transition-shadow hover:shadow-sm",
      status === "REJECTED" ? "border-red-300 bg-red-50/30" : "border-gray-100"
    )}>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-4 text-xs text-gray-600">
          <div className="flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5 text-[#2993A3]" />
            {jFormat(dateObj, "yyyy-MM-dd")}
          </div>
          <div className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5 text-[#2993A3]" />
            {jFormat(dateObj, "HH:mm")}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {status === "PENDING" && (
            <span className="flex items-center gap-1 text-xs text-yellow-600 bg-yellow-50 px-3 py-1 rounded-full">
              <Hourglass className="h-3 w-3" /> در انتظار تایید
            </span>
          )}
          {status === "APPROVED" && (
            <span className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-3 py-1 rounded-full">
              <CheckCircle className="h-3 w-3" /> تایید شده
            </span>
          )}
          {status === "REJECTED" && (
            <span className="flex items-center gap-1 text-xs text-red-600 bg-red-50 px-3 py-1 rounded-full">
              <XCircle className="h-3 w-3" /> رد شده
            </span>
          )}
          {status === "CANCELLED" && (
            <span className="flex items-center gap-1 text-xs text-gray-600 bg-gray-100 px-3 py-1 rounded-full">
              <XCircle className="h-3 w-3" /> لغو شده
            </span>
          )}
        </div>
      </div>

      {status === "REJECTED" && userNote && (
        <p className="text-xs text-red-500 bg-red-50 p-2 rounded-md border border-red-100">
          <span className="font-bold">پیام کلینیک:</span> {userNote}
        </p>
      )}

      <Button 
        variant="outline" 
        size="sm" 
        className="w-full sm:w-auto border-red-200 text-red-500 hover:bg-red-50"
        onClick={handleCancelClick}
      >
        <Trash2 className="h-4 w-4 ml-1" />
        لغو نوبت
      </Button>
    </div>
  );
});
AppointmentRow.displayName = "AppointmentRow";
export default AppointmentRow;