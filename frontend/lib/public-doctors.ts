import api from "./api";
import type {
  DoctorDetail,
  DoctorRatingSummary,
  DoctorReviewSubmission,
  PaginatedResponse,
  PublicDoctor,
  PublicCatalog,
  RatingParameter,
  Review,
  ReviewEligibility,
} from "./types";

export const getPublicDoctorsPage = async (
  search?: string,
  page = 1,
  signal?: AbortSignal,
): Promise<PaginatedResponse<PublicDoctor>> => {
  const res = await api.get("/doctors/list/", { params: { search, page, page_size: 100 }, signal });
  if (Array.isArray(res.data)) {
    return { count: res.data.length, next: null, previous: null, results: res.data };
  }
  return res.data;
};

export const getPublicDoctorsList = async (search?: string): Promise<PublicDoctor[]> => {
  return (await getPublicDoctorsPage(search)).results;
};

export const getPublicDoctorPreview = async (): Promise<PublicDoctor[]> => {
  const res = await api.get("/doctors/preview/");
  return res.data;
};

export const getPublicDoctorDetail = async (
  id: string | number,
  signal?: AbortSignal,
): Promise<DoctorDetail> => {
  const res = await api.get(`/doctors/${id}/`, { signal });
  return res.data;
};

export const toggleDoctorLike = async (id: string | number): Promise<{ is_liked: boolean; likes_count: number }> => {
  const res = await api.post(`/doctors/${id}/like/`);
  return res.data;
};

export const getDoctorReviews = async (
  id: string | number,
  page = 1,
  signal?: AbortSignal,
): Promise<PaginatedResponse<Review>> => {
  const res = await api.get(`/doctors/${id}/reviews/`, { params: { page }, signal });
  if (Array.isArray(res.data)) {
    return { count: res.data.length, next: null, previous: null, results: res.data };
  }
  return res.data;
};

export const getRatingParameters = async (): Promise<RatingParameter[]> => {
  const res = await api.get("/doctors/rating-parameters/");
  return res.data;
};

export async function getMatchingDoctors(insuranceId: number, serviceId: number): Promise<PublicDoctor[]> {
  const doctors: PublicDoctor[] = [];
  let page = 1;
  // Filter before pagination; never silently exclude doctors after the first 100.
  while (true) {
    const { data } = await api.get<PaginatedResponse<PublicDoctor>>("/doctors/list/", {
      params: { insurance_id: insuranceId, service_id: serviceId, page, page_size: 100 },
    });
    doctors.push(...data.results);
    if (!data.next) return doctors;
    page += 1;
  }
}

export const getPublicCatalog = async (): Promise<PublicCatalog> => {
  const res = await api.get("/doctors/catalog/");
  return res.data;
};

export const getDoctorRatingSummary = async (
  id: string | number,
): Promise<DoctorRatingSummary> => {
  const res = await api.get(`/doctors/${id}/rating-summary/`);
  return res.data;
};

export const getDoctorReviewEligibility = async (
  id: string | number,
): Promise<ReviewEligibility> => {
  const res = await api.get(`/doctors/${id}/review-eligibility/`);
  return res.data;
};

export const submitDoctorReview = async (id: string | number, payload: DoctorReviewSubmission): Promise<Review> => {
  const res = await api.post(`/doctors/${id}/reviews/`, payload);
  return res.data;
};
