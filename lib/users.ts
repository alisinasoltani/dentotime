import api from "./api";

export interface User {
  id: string;
  first_name: string;
  last_name: string;
  username: string;
  profile_picture?: string;
  date_joined: string;
}

export const getUsersList = async (params: {
  search?: string;
  ordering?: string;
}) => {
  const res = await api.get("/admin/users/", { params });
  const data = res.data;
  return Array.isArray(data) ? data : (data.results || []);
};

export const deactivateUserApi = async (userId: string, reason: string) => {
  await api.patch(`/admin/users/${userId}/deactivate/`, { reason });
};