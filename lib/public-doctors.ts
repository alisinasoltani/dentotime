import api from "./api";
import type { PublicDoctor, DoctorDetail, PaginatedResponse, Review } from "./types";

export const getPublicDoctorsPage = async (
  search?: string,
  page = 1,
): Promise<PaginatedResponse<PublicDoctor>> => {
  const res = await api.get("/doctors/list/", { params: { search, page } });
  if (Array.isArray(res.data)) {
    return { count: res.data.length, next: null, previous: null, results: res.data };
  }
  return res.data;
};

export const getPublicDoctorsList = async (search?: string): Promise<PublicDoctor[]> => {
  return (await getPublicDoctorsPage(search)).results;
};

export const getPublicDoctorDetail = async (id: string | number): Promise<DoctorDetail> => {
  const res = await api.get(`/doctors/${id}/`);
  return res.data;
};

export const toggleDoctorLike = async (id: string | number): Promise<{ is_liked: boolean; likes_count: number }> => {
  const res = await api.post(`/doctors/${id}/like/`);
  return res.data;
};

export const getDoctorReviews = async (
  id: string | number,
  page = 1,
): Promise<PaginatedResponse<Review>> => {
  const res = await api.get(`/doctors/${id}/reviews/`, { params: { page } });
  if (Array.isArray(res.data)) {
    return { count: res.data.length, next: null, previous: null, results: res.data };
  }
  return res.data;
};

export const submitDoctorReview = async (id: string | number, payload: { rating: number; comment: string }): Promise<Review> => {
  const res = await api.post(`/doctors/${id}/reviews/`, payload);
  return res.data;
};
