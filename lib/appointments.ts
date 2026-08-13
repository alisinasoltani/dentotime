import api from "./api";

export const getAppointments = async (params: { search?: string }) => {
  const res = await api.get("/admin/appointments/", { params });
  const data = res.data;
  return Array.isArray(data) ? data : (data.results || []);
};

export const getAppointmentsCalendar = async (month: string) => {
  // month format: "2024-05"
  const res = await api.get(`/admin/appointments/calendar/?month=${month}`);
  return res.data; // { "2024-05-15": [appt1, appt2], ... }
};

export const rejectAppointmentApi = async (id: string, admin_notes: string) => {
  await api.patch(`/admin/appointments/${id}/`, {
    status: "REJECTED",
    admin_notes: admin_notes,
  });
};