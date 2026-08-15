import api from "./api";
import type { PaginatedResponse } from "./types";

export interface Doctor {
  id: number;
  user?: {
    id: string;
    first_name: string;
    last_name: string;
    username: string;
    profile_picture?: string;
    date_joined: string;
  };
  first_name?: string;
  last_name?: string;
  username?: string;
  profile_picture?: string;
  verification_status: "PENDING" | "APPROVED" | "REJECTED";
  verification_date?: string;
  average_rating: number;
  vote_count: number;
  documents?: Array<{
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
  page?: number;
  verification_status?: Doctor["verification_status"];
}): Promise<PaginatedResponse<Doctor>> => {
  const res = await api.get("/admin/doctors/", { params });
  return res.data;
};

export const getAdminDoctorDetail = async (doctorId: number): Promise<Doctor> => {
  const res = await api.get(`/admin/doctors/${doctorId}/`);
  return res.data;
};

export const deactivateDoctorApi = async (userId: string, reason: string) => {
  // طبق داکیومنت، برای حذف نرم (Soft Delete) از این API استفاده می‌شود
  await api.patch(`/admin/users/${userId}/deactivate/`, { reason });
};
