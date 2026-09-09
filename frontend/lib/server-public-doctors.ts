import "server-only";

import { cache } from "react";

import type {
  DoctorDetail,
  PaginatedResponse,
  PublicDoctor,
  PublicCatalog,
  Review,
} from "@/lib/types";


const backendOrigin = (
  process.env.BACKEND_INTERNAL_URL ?? "http://127.0.0.1:8000"
).replace(/\/$/, "");

async function publicApi<T>(path: string, fresh = false): Promise<T | null> {
  try {
    const response = await fetch(`${backendOrigin}/api/v1${path}`, {
      headers: { Accept: "application/json" },
      ...(fresh ? { cache: "no-store" as const } : { next: { revalidate: 60, tags: ["public-doctors"] } }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return null;
    return await response.json() as T;
  } catch {
    return null;
  }
}

export const getServerDoctorsPage = cache(
  async (search = "", page = 1): Promise<PaginatedResponse<PublicDoctor>> => {
    const query = new URLSearchParams({ page: String(page), page_size: "100" });
    if (search) query.set("search", search);
    return (
      await publicApi<PaginatedResponse<PublicDoctor>>(`/doctors/list/?${query}`)
    ) ?? { count: 0, next: null, previous: null, results: [] };
  },
);

export const getServerDoctorPreview = cache(async (): Promise<PublicDoctor[]> => (
  await publicApi<PublicDoctor[]>("/doctors/preview/") ?? []
));

export const getServerPublicCatalog = cache(async (): Promise<PublicCatalog> => (
  await publicApi<PublicCatalog>("/doctors/catalog/") ?? { services: [], insurances: [] }
));

export const getServerDoctorDetail = cache(
  async (id: string): Promise<DoctorDetail | null> => (
    await publicApi<DoctorDetail>(`/doctors/${encodeURIComponent(id)}/`, true)
  ),
);

export const getServerDoctorReviews = cache(
  async (id: string): Promise<PaginatedResponse<Review>> => (
    await publicApi<PaginatedResponse<Review>>(
      `/doctors/${encodeURIComponent(id)}/reviews/`,
    ) ?? { count: 0, next: null, previous: null, results: [] }
  ),
);
