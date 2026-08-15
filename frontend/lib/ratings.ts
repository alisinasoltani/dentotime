import api from "./api";
import type { RatingVoterPage } from "./types";

export async function getRatingVoters(
  endpoint: string,
  options: { page?: number; search?: string; rating?: string } = {},
): Promise<RatingVoterPage> {
  const response = await api.get<RatingVoterPage>(endpoint, {
    params: {
      page: options.page ?? 1,
      search: options.search || undefined,
      rating: options.rating && options.rating !== "all" ? options.rating : undefined,
    },
  });
  return response.data;
}
