"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import api from "@/lib/api";
import { Appointment, getAppointmentDate } from "@/lib/types";
import AppointmentRow from "@/components/user/appointment-row";
import BookingModal from "@/components/user/booking-modal";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export default function UserAppointmentsPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);

  const fetchAppointments = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await api.get("/appointments/me/");
      const data = Array.isArray(res.data) ? res.data : res.data.results;
      setAppointments(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAppointments();
  }, [fetchAppointments]);

  const handleCancel = async (id: string) => {
    const prev = appointments;
    setAppointments(prev => prev.map(a => a.id === id ? { ...a, status: "CANCELLED" } : a));
    try {
      await api.post(`/appointments/${id}/cancel/`);
    } catch (err) {
      setAppointments(prev);
      throw err;
    }
  };

  const filteredAppointments = useMemo(() => {
    let filtered = appointments.filter(a => getAppointmentDate(a) !== null);
    if (statusFilter !== "all") {
      filtered = filtered.filter(a => a.status === statusFilter);
    }
    return filtered.sort((a, b) => (getAppointmentDate(b)?.getTime() || 0) - (getAppointmentDate(a)?.getTime() || 0));
  }, [appointments, statusFilter]);

  return (
    <div className="w-full min-h-full flex flex-col space-y-6 bg-white rounded-2xl p-4 md:p-8">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <h1 className="text-xl md:text-2xl font-bold text-gray-800">نوبت های من</h1>
        <Button 
          onClick={() => setIsBookingModalOpen(true)}
          className="bg-[#2993A3] hover:bg-[#1f7b89] rounded-full flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          ثبت نوبت جدید
        </Button>
      </div>

      <div className="bg-white p-4 rounded-xl border border-gray-100 grid grid-cols-1 md:flex md:flex-row gap-4 md:items-center">
        <div className={cn(
          "flex items-center gap-1 p-1 border rounded-lg w-full md:w-auto",
          statusFilter !== "all" ? "border-[#66D3F7] bg-[#F5FAFF]" : "border-gray-200"
        )}>
          <span className="text-xs text-gray-500 px-2 whitespace-nowrap">فیلتر وضعیت:</span>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="flex-1 text-xs border-none bg-transparent focus:ring-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="text-xs">
              <SelectItem className="text-xs" value="all">همه نوبت‌ها</SelectItem>
              <SelectItem className="text-xs" value="PENDING">در انتظار تایید</SelectItem>
              <SelectItem className="text-xs" value="APPROVED">تایید شده</SelectItem>
              <SelectItem className="text-xs" value="REJECTED">رد شده</SelectItem>
              <SelectItem className="text-xs" value="CANCELLED">لغو شده</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex-1 space-y-3 pb-4">
        {isLoading ? (
          <p className="text-center text-gray-400 py-8">در حال بارگذاری...</p>
        ) : filteredAppointments.length === 0 ? (
          <div className="text-center py-8 bg-white rounded-xl border border-gray-100">
            <p className="text-gray-400">نوبتی یافت نشد.</p>
          </div>
        ) : (
          filteredAppointments.map(appt => (
            <AppointmentRow key={appt.id} appointment={appt} onCancel={handleCancel} />
          ))
        )}
      </div>

      <BookingModal 
        isOpen={isBookingModalOpen} 
        onClose={() => setIsBookingModalOpen(false)} 
        onSuccess={fetchAppointments} 
      />
    </div>
  );
}