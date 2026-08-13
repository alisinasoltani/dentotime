import api from "./api";
import type { PublicDoctor, DoctorDetail, Review } from "./types";

export const getPublicDoctorsList = async (search?: string): Promise<PublicDoctor[]> => {
  const res = await api.get("/doctors/list/", { params: { search } });
  const data = res.data;
  return Array.isArray(data) ? data : (data.results || []);
};

export const getPublicDoctorDetail = async (id: string | number): Promise<DoctorDetail> => {
  const res = await api.get(`/doctors/${id}/`);
  return res.data;
};

export const toggleDoctorLike = async (id: string | number): Promise<{ is_liked: boolean; likes_count: number }> => {
  const res = await api.post(`/doctors/${id}/like/`);
  return res.data;
};

export const getDoctorReviews = async (id: string | number): Promise<Review[]> => {
  const res = await api.get(`/doctors/${id}/reviews/`);
  const data = res.data;
  return Array.isArray(data) ? data : (data.results || []);
};

export const submitDoctorReview = async (id: string | number, payload: { rating: number; comment: string }): Promise<Review> => {
  const res = await api.post(`/doctors/${id}/reviews/`, payload);
  return res.data;
};