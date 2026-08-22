import api from "@/lib/api";
import type { RatingParameter } from "@/lib/types";


export async function getAdminRatingParameters(): Promise<RatingParameter[]> {
  const response = await api.get("/admin/rating-parameters/");
  if (Array.isArray(response.data)) return response.data;
  return response.data.results ?? [];
}

export async function updateAdminRatingParameter(
  parameterId: number,
  payload: Partial<RatingParameter>,
): Promise<RatingParameter> {
  const response = await api.patch(`/admin/rating-parameters/${parameterId}/`, payload);
  return response.data;
}
