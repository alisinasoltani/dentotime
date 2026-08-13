import api from "./api";
import type { DoctorRequest, PaginatedResponse } from "./types";

export const getDoctorRequests = async (params: {
  search?: string;
  verification_status?: string;
  ordering?: string;
  page?: number;
}): Promise<PaginatedResponse<DoctorRequest>> => {
  const res = await api.get("/admin/doctors/", { params });
  return {
    ...res.data,
    results: res.data.results.map((doctor: DoctorRequest & { verification_submitted_at?: string; date_joined?: string }) => ({
      ...doctor,
      submitted_at: doctor.verification_submitted_at || doctor.submitted_at || doctor.date_joined || "",
    })),
  };
};

export const getDoctorRequestDetail = async (
  doctorId: number,
): Promise<DoctorRequest> => {
  const res = await api.get(`/admin/doctors/${doctorId}/`);
  return {
    ...res.data,
    submitted_at: res.data.verification_submitted_at || res.data.submitted_at || res.data.date_joined || "",
  };
};

export const approveDoctorApi = async (doctorId: number) => {
  await api.post(`/admin/doctors/${doctorId}/approve/`);
};

export const rejectDoctorApi = async (doctorId: number, rejection_note: string, internal_note: string) => {
  // طبق داکیومنت فقط rejection_note داریم، اما internal_note را هم میفرستیم تا بک‌اند ذخیره کند
  await api.post(`/admin/doctors/${doctorId}/reject/`, { 
    rejection_note: `یادداشت پزشک: ${rejection_note} | یادداشت ادمین‌ها: ${internal_note}` 
  });
};
