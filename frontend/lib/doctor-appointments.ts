import api from "@/lib/api";
import type {
  Appointment,
  DoctorAvailabilityRule,
  DoctorAvailabilitySlot,
  DoctorCalendarDay,
  PaginatedResponse,
} from "@/lib/types";


export interface DoctorAppointmentCalendarResponse {
  month: string | null;
  start_date: string;
  end_date: string;
  days: DoctorCalendarDay[];
}

export interface DoctorAvailabilityResponse {
  timezone: "Asia/Tehran";
  slots: DoctorAvailabilitySlot[];
  rules: DoctorAvailabilityRule[];
}

export interface DoctorAvailabilityPayload {
  start_date: string;
  end_date: string;
  weekdays: number[];
  start_time: string;
  end_time: string;
  slot_duration_minutes: number;
  save_as_routine: boolean;
}

export async function getDoctorAppointments(
  date?: string,
  page = 1,
): Promise<PaginatedResponse<Appointment>> {
  const response = await api.get<PaginatedResponse<Appointment>>(
    "/appointments/doctor/",
    { params: { date, page } },
  );
  return response.data;
}

export async function getDoctorAppointmentCalendar(
  startDate: string,
  endDate: string,
): Promise<DoctorAppointmentCalendarResponse> {
  const response = await api.get<DoctorAppointmentCalendarResponse>(
    "/appointments/doctor/calendar/",
    { params: { start_date: startDate, end_date: endDate } },
  );
  return response.data;
}

export async function cancelDoctorAppointment(
  appointmentId: string,
): Promise<Appointment> {
  const response = await api.post<Appointment>(
    `/appointments/doctor/${appointmentId}/cancel/`,
    {},
  );
  return response.data;
}

export async function getDoctorAvailability(
  startDate: string,
  endDate = startDate,
): Promise<DoctorAvailabilityResponse> {
  const response = await api.get<DoctorAvailabilityResponse>(
    "/appointments/doctor/availability/",
    { params: { start_date: startDate, end_date: endDate } },
  );
  return response.data;
}

export async function createDoctorAvailability(
  payload: DoctorAvailabilityPayload,
): Promise<{
  created: number;
  restored: number;
  existing: number;
  skipped_past: number;
  rules_created: number;
}> {
  const response = await api.post(
    "/appointments/doctor/availability/",
    payload,
  );
  return response.data;
}

export async function deleteDoctorAvailabilitySlot(slotId: number) {
  const response = await api.delete(
    `/appointments/doctor/availability/slots/${slotId}/`,
  );
  return response.data;
}

export async function deleteDoctorAvailabilityDay(date: string) {
  const response = await api.delete(
    `/appointments/doctor/availability/days/${date}/`,
  );
  return response.data;
}
