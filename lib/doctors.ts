import api from "./api";

export interface Doctor {
  id: number;
  user: {
    id: string;
    first_name: string;
    last_name: string;
    username: string;
    profile_picture?: string;
    date_joined: string;
  };
  verification_status: "PENDING" | "APPROVED" | "REJECTED";
  verification_date?: string;
  documents: Array<{
    asset_id: string;
    file_name: string;
    file_size: number;
    state?: string;
    scan_status?: string;
    download_url?: string;
  }>;
}

export const getDoctorsList = async (params: {
  search?: string;
  ordering?: string;
}) => {
  const res = await api.get("/admin/doctors/", { params });
  const data = res.data;
  return Array.isArray(data) ? data : (data.results || []);
};

export const deactivateDoctorApi = async (userId: string, reason: string) => {
  // طبق داکیومنت، برای حذف نرم (Soft Delete) از این API استفاده می‌شود
  await api.patch(`/admin/users/${userId}/deactivate/`, { reason });
};
