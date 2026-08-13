'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { getPublicDoctorsPage } from '@/lib/public-doctors';
import { PublicDoctor } from '@/lib/types';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Search, Heart, Star, Stethoscope, ChevronLeft } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';

export default function DoctorsListPage() {
  const [doctors, setDoctors] = useState<PublicDoctor[]>([]);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedSearch(search), 500);
    return () => clearTimeout(handler);
  }, [search]);

  const fetchDoctors = useCallback(async (nextPage = 1, append = false) => {
    if (append) setIsLoadingMore(true);
    else setIsLoading(true);
    try {
      const data = await getPublicDoctorsPage(debouncedSearch, nextPage);
      setDoctors((current) => append ? [...current, ...data.results] : data.results);
      setPage(nextPage);
      setHasMore(Boolean(data.next));
    } catch (err) {
      console.error(err);
    } finally {
      if (append) setIsLoadingMore(false);
      else setIsLoading(false);
    }
  }, [debouncedSearch]);

  useEffect(() => {
    void fetchDoctors(1, false);
  }, [fetchDoctors]);

  return (
    <div className="min-h-screen w-full bg-slate-50" dir="rtl">
      <div className="max-w-5xl mx-auto px-4 py-12">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">لیست پزشکان</h1>
          <p className="text-gray-500">برای اطلاعات بیشتر روی پروفایل پزشک کلیک کنید</p>
        </div>

        <div className="relative mb-8 max-w-md mx-auto">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <Input
            placeholder="جستجوی نام پزشک یا مطب..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pr-11 py-3 rounded-full bg-white shadow-sm border-gray-200 focus:border-[#5FB4FF]"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
                <Skeleton className="w-16 h-16 rounded-full" />
                <div className="flex-1">
                  <Skeleton className="h-5 w-1/2 mb-2" />
                  <Skeleton className="h-4 w-1/3" />
                </div>
              </div>
            ))
          ) : doctors.length === 0 ? (
            <div className="col-span-2 text-center py-12 text-gray-400">
              پزشکی با این مشخصات یافت نشد.
            </div>
          ) : (
            doctors.map((doc) => (
              <Link 
                href={`/doctors/${doc.id}`} 
                key={doc.id} 
                className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4 transition-all hover:shadow-md hover:border-[#5FB4FF]"
              >
                <Avatar className="w-16 h-16 border-2 border-[#5FB4FF] flex-shrink-0">
                  <AvatarImage src={doc.profile_picture || undefined} />
                  <AvatarFallback className="bg-[#E9F5F9] text-[#2993A3]">
                    <Stethoscope className="w-6 h-6" />
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-slate-800 truncate">دکتر {doc.first_name} {doc.last_name}</h3>
                  <p className="text-sm text-gray-500 mb-2 truncate">{doc.clinic_name || "مطب خصوصی"}</p>
                  <div className="flex items-center gap-1 text-xs font-bold text-[#2993A3]">
                    <Heart className="w-3.5 h-3.5" fill="currentColor" />
                    {doc.likes_count || 0} لایک
                  </div>
                  <div className="mt-1 flex items-center gap-1 text-xs font-semibold text-yellow-600">
                    <Star className="h-3.5 w-3.5" fill="currentColor" />
                    {doc.average_rating.toFixed(1)} از ۵ ({doc.vote_count} رأی)
                  </div>
                </div>
                <ChevronLeft className="w-5 h-5 text-gray-400" />
              </Link>
            ))
          )}
        </div>
        {hasMore && !isLoading && (
          <div className="mt-8 text-center">
            <Button variant="outline" disabled={isLoadingMore} onClick={() => void fetchDoctors(page + 1, true)}>
              {isLoadingMore ? "در حال دریافت…" : "نمایش پزشکان بیشتر"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
