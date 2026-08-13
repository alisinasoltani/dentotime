import api from "./api";
import type { PaginatedResponse } from "./types";

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
  page?: number;
}): Promise<PaginatedResponse<User>> => {
  const res = await api.get("/admin/users/", { params });
  return res.data;
};

export const deactivateUserApi = async (userId: string, reason: string) => {
  await api.patch(`/admin/users/${userId}/deactivate/`, { reason });
};
