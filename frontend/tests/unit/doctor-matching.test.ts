import { beforeEach, expect, test, vi } from "vitest";
import api from "@/lib/api";
import { getMatchingDoctors } from "@/lib/public-doctors";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn() } }));

beforeEach(() => vi.resetAllMocks());

test("matches insurance and service before pagination and includes every page", async () => {
  vi.mocked(api.get).mockResolvedValueOnce({ data: { results: [{ id: 1 }], next: "http://internal/api/v1/doctors/list/?page=2" } });
  vi.mocked(api.get).mockResolvedValueOnce({ data: { results: [{ id: 2 }], next: null } });
  expect(await getMatchingDoctors(10, 20)).toEqual([{ id: 1 }, { id: 2 }]);
  expect(api.get).toHaveBeenNthCalledWith(1, "/doctors/list/", { params: { insurance_id: 10, service_id: 20, page: 1, page_size: 100 } });
  expect(api.get).toHaveBeenNthCalledWith(2, "/doctors/list/", { params: { insurance_id: 10, service_id: 20, page: 2, page_size: 100 } });
});

test("preserves an empty match without falling back to unfiltered doctors", async () => {
  vi.mocked(api.get).mockResolvedValue({ data: { results: [], next: null } });
  expect(await getMatchingDoctors(10, 20)).toEqual([]);
});
