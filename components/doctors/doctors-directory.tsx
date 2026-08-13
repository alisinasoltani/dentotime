"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import useSWRInfinite from "swr/infinite";
import { Search } from "lucide-react";

import { DoctorCard } from "@/components/doctors/doctor-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { getPublicDoctorsPage } from "@/lib/public-doctors";
import type { PaginatedResponse, PublicDoctor } from "@/lib/types";


export function DoctorsDirectory({
  initialPage,
}: {
  initialPage: PaginatedResponse<PublicDoctor>;
}) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const controllers = useRef(new Set<AbortController>());

  useEffect(() => {
    const timer = window.setTimeout(() => {
      controllers.current.forEach((controller) => controller.abort());
      controllers.current.clear();
      setDebouncedSearch(search.trim());
    }, 350);
    return () => window.clearTimeout(timer);
  }, [search]);

  const fetcher = useCallback(async ([, query, page]: readonly [string, string, number]) => {
    const nextController = new AbortController();
    controllers.current.add(nextController);
    try {
      return await getPublicDoctorsPage(query, page, nextController.signal);
    } finally {
      controllers.current.delete(nextController);
    }
  }, []);

  useEffect(() => () => {
    controllers.current.forEach((controller) => controller.abort());
    controllers.current.clear();
  }, []);

  const { data, error, isLoading, isValidating, size, setSize } = useSWRInfinite(
    (pageIndex, previous: PaginatedResponse<PublicDoctor> | null) => {
      if (previous && !previous.next) return null;
      return ["public-doctors", debouncedSearch, pageIndex + 1] as const;
    },
    fetcher,
    {
      fallbackData: debouncedSearch ? undefined : [initialPage],
      dedupingInterval: 10_000,
      revalidateFirstPage: true,
      revalidateOnFocus: false,
    },
  );
  const doctors = data?.flatMap((page) => page.results) ?? [];
  const hasMore = Boolean(data?.at(-1)?.next);
  const isLoadingMore = isValidating && size > 1;

  return (
    <div className="min-h-screen w-full bg-slate-50" dir="rtl">
      <div className="mx-auto max-w-5xl px-4 py-12">
        <div className="mb-8 text-center">
          <h1 className="mb-2 text-3xl font-bold text-slate-900">لیست پزشکان</h1>
          <p className="text-gray-500">برای اطلاعات بیشتر روی پروفایل پزشک کلیک کنید</p>
        </div>
        <div className="relative mx-auto mb-8 max-w-md">
          <Search className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="جستجوی نام پزشک یا مطب..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="rounded-full border-gray-200 bg-white py-3 pr-11 shadow-sm focus:border-[#5FB4FF]"
          />
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2" aria-busy={isLoading}>
          {isLoading && !data ? (
            Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-36 rounded-2xl" />
            ))
          ) : doctors.length === 0 ? (
            <p className="col-span-2 py-12 text-center text-gray-400">
              پزشکی با این مشخصات یافت نشد.
            </p>
          ) : doctors.map((doctor) => (
            <DoctorCard key={doctor.id} doctor={doctor} />
          ))}
        </div>
        {error && (
          <p role="alert" className="mt-6 text-center text-sm text-red-600">
            دریافت فهرست پزشکان بیش از حد انتظار طول کشید. دوباره تلاش کنید.
          </p>
        )}
        {hasMore && (
          <div className="mt-8 text-center">
            <Button
              variant="outline"
              disabled={isLoadingMore}
              onClick={() => void setSize(size + 1)}
            >
              {isLoadingMore ? "در حال دریافت…" : "نمایش پزشکان بیشتر"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
