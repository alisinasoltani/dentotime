"use client";

import React from "react";
import { Appointment, getAppointmentDate } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreVertical, Trash2, Clock, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns-jalali";

interface Props {
  appointment: Appointment;
  onReject: (id: string) => void;
}

const AppointmentRow = React.memo(({ appointment, onReject }: Props) => {
  const isRejected = appointment.status === "REJECTED";
  const user = (appointment as any).user || (appointment as any).patient || (appointment as any).user_info || {};
  const fullName = `${user.first_name || ""} ${user.last_name || ""}`.trim() || "کاربر ناشناس";
  
  const dateObj = getAppointmentDate(appointment);
  // اگر تاریخ نامعتبر بود، کل ردیف رندر نشود
  if (!dateObj) return null;

  let userNote = "";
  if (appointment.admin_notes) {
    const parts = appointment.admin_notes.split("|");
    userNote = parts[0]?.replace("یادداشت کاربر:", "").trim() || "";
  }

  return (
    <div className={cn(
      "bg-white border rounded-xl p-4 flex flex-col md:flex-row md:items-center gap-4 transition-shadow hover:shadow-sm",
      isRejected ? "border-red-300 bg-red-50/30" : "border-gray-100"
    )}>
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-gray-800 text-sm truncate">{fullName}</h3>
        <p className="text-xs text-gray-500 truncate">@{user.username || "unknown"}</p>
        
        {isRejected && userNote && (
          <p className="text-xs text-red-500 mt-2 bg-red-50 p-2 rounded-md border border-red-100">
            <span className="font-bold">یادداشت:</span> {userNote}
          </p>
        )}
      </div>

      <div className="flex items-center gap-4 text-xs text-gray-600 flex-shrink-0">
        <div className="flex items-center gap-1">
          <Calendar className="h-3.5 w-3.5 text-[#2993A3]" />
          {format(dateObj, "yyyy-MM-dd")}
        </div>
        <div className="flex items-center gap-1">
          <Clock className="h-3.5 w-3.5 text-[#2993A3]" />
          {format(dateObj, "HH:mm")}
        </div>
      </div>

      {!isRejected && (
        <div className="flex-shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full hover:bg-gray-100">
                <MoreVertical className="h-5 w-5 text-gray-500" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onReject(appointment.id)} className="text-red-500 cursor-pointer">
                <Trash2 className="h-4 w-4 ml-2" />
                رد نوبت
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
});
AppointmentRow.displayName = "AppointmentRow";
export default AppointmentRow;