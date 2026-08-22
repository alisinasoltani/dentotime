"use client";

import React from "react";
import { Appointment, getAppointmentDate } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Clock, Calendar, Trash2, CheckCircle, XCircle, Hourglass, Stethoscope } from "lucide-react";
import { cn } from "@/lib/utils";
import { format as jFormat } from "date-fns-jalali";
import { toast } from "sonner";

interface Props {
  appointment: Appointment;
  onCancel: (id: string) => Promise<void>; // تغییر نوع به Promise
  onAttendance: (id: string, attended: boolean) => Promise<void>;
}

const AppointmentRow = React.memo(({ appointment, onCancel, onAttendance }: Props) => {
  const [isConfirmingAttendance, setIsConfirmingAttendance] = React.useState(false);
  const dateObj = getAppointmentDate(appointment);
  if (!dateObj) return null;

  const status = appointment.status;
  const appointmentEnded = new Date(appointment.slot?.end_at ?? dateObj).getTime() <= Date.now();
  const attendanceCanBeConfirmed = appointmentEnded && !["REJECTED", "CANCELLED", "NO_SHOW"].includes(status);
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

  const handleAttendanceClick = async (attended: boolean) => {
    setIsConfirmingAttendance(true);
    try {
      await onAttendance(appointment.id, attended);
      toast.success(attended ? "وضعیت نوبت به «مراجعه کردم» تغییر کرد." : "وضعیت نوبت ثبت شد.");
    } catch {
      toast.error("ثبت وضعیت مراجعه انجام نشد. دوباره تلاش کنید.");
    } finally {
      setIsConfirmingAttendance(false);
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

      {appointment.doctor ? (
        <div className="flex items-center gap-2 text-sm font-bold text-gray-700">
          <Stethoscope className="size-4 text-[#2993A3]" aria-hidden="true" />
          دکتر {appointment.doctor.first_name} {appointment.doctor.last_name}
        </div>
      ) : null}

      {status === "REJECTED" && userNote && (
        <p className="text-xs text-red-500 bg-red-50 p-2 rounded-md border border-red-100">
          <span className="font-bold">پیام کلینیک:</span> {userNote}
        </p>
      )}

      {attendanceCanBeConfirmed && appointment.attendance_status === "NOT_CONFIRMED" && appointment.doctor ? (
        <div className="rounded-lg border border-[#CFE5E8] bg-[#F5FAFF] p-4">
          <p className="text-sm font-bold text-gray-800">
            آیا برای نوبت خود به دکتر {appointment.doctor.first_name} {appointment.doctor.last_name} مراجعه کردید؟
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              type="button"
              size="sm"
              disabled={isConfirmingAttendance}
              onClick={() => void handleAttendanceClick(true)}
            >
              بله، مراجعه کردم
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isConfirmingAttendance}
              onClick={() => void handleAttendanceClick(false)}
            >
              خیر
            </Button>
          </div>
        </div>
      ) : null}

      {appointment.attendance_status === "ATTENDED" ? (
        <span className="inline-flex w-fit items-center gap-1 rounded-full bg-green-50 px-3 py-1 text-xs font-bold text-green-700">
          <CheckCircle className="size-3" aria-hidden="true" /> مراجعه کردم
        </span>
      ) : null}

      {appointment.attendance_status === "DID_NOT_ATTEND" && attendanceCanBeConfirmed ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-gray-500">وضعیت فعلی: مراجعه نکردم</span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isConfirmingAttendance}
            onClick={() => void handleAttendanceClick(true)}
          >
            تغییر به مراجعه کردم
          </Button>
        </div>
      ) : null}

      {["PENDING", "APPROVED"].includes(status) && !appointmentEnded ? (
        <Button
          variant="outline"
          size="sm"
          className="w-full sm:w-auto border-red-200 text-red-500 hover:bg-red-50"
          onClick={handleCancelClick}
        >
          <Trash2 data-icon="inline-start" />
          لغو نوبت
        </Button>
      ) : null}
    </div>
  );
});
AppointmentRow.displayName = "AppointmentRow";
export default AppointmentRow;
