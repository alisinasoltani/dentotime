import api from "./api";
import type { Appointment, PaginatedResponse } from "./types";

export interface AppointmentQuery {
  search?: string;
  ordering?: string;
  page?: number;
  start_date?: string;
  end_date?: string;
  status?: string;
}

export interface CalendarDaySummary {
  date: string;
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  cancelled: number;
  completed: number;
  no_show: number;
}

export const getAppointments = async (
  params: AppointmentQuery,
): Promise<PaginatedResponse<Appointment>> => {
  const res = await api.get("/admin/appointments/", { params });
  return res.data;
};

export const getAppointmentsCalendar = async (
  month: string,
): Promise<{ month: string; days: CalendarDaySummary[] }> => {
  const res = await api.get(`/admin/appointments/calendar/?month=${month}`);
  return res.data;
};

export const rejectAppointmentApi = async (id: string, admin_notes: string) => {
  await api.patch(`/admin/appointments/${id}/`, {
    status: "REJECTED",
    admin_notes: admin_notes,
  });
};
