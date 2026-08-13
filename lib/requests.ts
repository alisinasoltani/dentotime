import api from "./api";

export const getDoctorRequests = async (params: {
  search?: string;
  verification_status?: string; // این خط تغییر کرد
  ordering?: string;
}) => {
  const res = await api.get("/admin/doctors/", { params });
  const data = res.data;
  return Array.isArray(data) ? data : (data.results || []);
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