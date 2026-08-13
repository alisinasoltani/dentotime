"use client";

import React from "react";
import { DoctorRequest } from "@/lib/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Check, X, Eye, Clock, CheckCircle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface RequestRowProps {
  request: DoctorRequest;
  onApprove: (id: number) => void;
  onReject: (id: number) => void;
  onViewDocs: (docs: DoctorRequest["documents"], name: string) => void;
}

const RequestRow = React.memo(({ request, onApprove, onReject, onViewDocs }: RequestRowProps) => {
  const isPending = request.verification_status === "PENDING";
  const isApproved = request.verification_status === "APPROVED";
  const isRejected = request.verification_status === "REJECTED";
  const user = request.user || {};
  const firstName = user.first_name || (request as any).first_name || "";
  const lastName = user.last_name || (request as any).last_name || "";
  const username = user.username || (request as any).username || "نامشخص";
  const profilePicture = user.profile_picture || (request as any).profile_picture || undefined;

  const fullName = `${firstName} ${lastName}`.trim() || "کاربر ناشناس";

  let doctorNote = "";
  if (request.rejection_note) {
    const parts = request.rejection_note.split("|");
    doctorNote = parts[0]?.replace("یادداشت پزشک:", "").trim() || request.rejection_note;
  }

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4 flex flex-col md:flex-row md:items-center gap-4 transition-shadow hover:shadow-sm">
      {/* User Info */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <Avatar className="w-12 h-12 border border-gray-200 flex-shrink-0">
          <AvatarImage src={profilePicture || undefined} />
          <AvatarFallback>{firstName?.[0]}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <h3 className="font-semibold text-gray-800 text-sm truncate">{fullName}</h3>
          <p className="text-xs text-gray-500 truncate">@{username}</p>

          {/* Notes for rejected requests */}
          {isRejected && doctorNote && (
            <p className="text-xs text-red-500 mt-1 bg-red-50 p-2 rounded-md">
              <span className="font-bold">دلیل رد:</span> {doctorNote}
            </p>
          )}
        </div>
      </div>

      {/* Status & Date */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {isPending && (
          <div className="flex items-center gap-1 text-xs text-yellow-600 bg-yellow-50 px-3 py-1 rounded-full">
            <Clock className="h-3 w-3" />
            در انتظار بررسی
          </div>
        )}
        {isApproved && (
          <div className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-3 py-1 rounded-full">
            <CheckCircle className="h-3 w-3" />
            تایید شده - {new Date(request.processed_at || request.submitted_at).toLocaleDateString("fa-IR")}
          </div>
        )}
        {isRejected && (
          <div className="flex items-center gap-1 text-xs text-red-600 bg-red-50 px-3 py-1 rounded-full">
            <XCircle className="h-3 w-3" />
            رد شده - {new Date(request.processed_at || request.submitted_at).toLocaleDateString("fa-IR")}
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
          onClick={() => onViewDocs(request.documents || (request as any).verification_documents || (request as any).files || [], fullName)}
        >
          <Eye className="h-4 w-4 ml-1" />
          مشاهده مدارک
        </Button>

        {isPending && (
          <>
            <Button
              size="sm"
              className="bg-green-500 hover:bg-green-600 text-white"
              onClick={() => onApprove(request.id)}
            >
              <Check className="h-4 w-4 ml-1" />
              تایید
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-red-200 text-red-500 hover:bg-red-50 hover:text-red-600"
              onClick={() => onReject(request.id)}
            >
              <X className="h-4 w-4 ml-1" />
              رد
            </Button>
          </>
        )}
      </div>
    </div>
  );
});
RequestRow.displayName = "RequestRow";
export default RequestRow;