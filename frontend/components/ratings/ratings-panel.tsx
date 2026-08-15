"use client";

import { useCallback, useEffect, useState } from "react";
import { Search, Star } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getRatingVoters } from "@/lib/ratings";
import type { RatingVoterPage } from "@/lib/types";

const EMPTY_PAGE: RatingVoterPage = {
  count: 0,
  next: null,
  previous: null,
  average_rating: 0,
  vote_count: 0,
  results: [],
};

export function RatingsPanel({ endpoint }: { endpoint: string }) {
  const [data, setData] = useState<RatingVoterPage>(EMPTY_PAGE);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [rating, setRating] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(1);
      setDebouncedSearch(search.trim());
    }, 350);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => { setPage(1); }, [endpoint]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await getRatingVoters(endpoint, { page, search: debouncedSearch, rating }));
    } catch {
      toast.error("دریافت امتیازها ناموفق بود");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, endpoint, page, rating]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-5" dir="rtl">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-yellow-100 bg-yellow-50 p-4 text-center">
          <div className="flex items-center justify-center gap-1 text-xl font-bold text-yellow-600">
            <Star className="h-5 w-5" fill="currentColor" />
            {data.average_rating.toFixed(1)}
          </div>
          <p className="mt-1 text-xs text-gray-500">از ۵</p>
        </div>
        <div className="rounded-2xl border border-cyan-100 bg-cyan-50 p-4 text-center">
          <p className="text-xl font-bold text-[#2993A3]">{data.vote_count}</p>
          <p className="mt-1 text-xs text-gray-500">رأی ثبت‌شده</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_150px]">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="جست‌وجوی نام رأی‌دهنده" className="pr-9" />
        </div>
        <Select value={rating} onValueChange={(value) => { setRating(value); setPage(1); }}>
          <SelectTrigger><SelectValue placeholder="همه امتیازها" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">همه امتیازها</SelectItem>
            {[5, 4, 3, 2, 1].map((value) => <SelectItem key={value} value={String(value)}>{value} ستاره</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="min-h-40 space-y-3">
        {loading ? (
          <p className="py-10 text-center text-sm text-gray-400">در حال دریافت امتیازها…</p>
        ) : data.results.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-400">امتیازی با این مشخصات یافت نشد.</p>
        ) : data.results.map((row) => (
          <article key={row.id} className="rounded-2xl border border-gray-100 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold text-slate-800">{row.voter.first_name} {row.voter.last_name}</p>
              <div className="flex items-center gap-1 text-sm font-bold text-yellow-500">
                <Star className="h-4 w-4" fill="currentColor" /> {row.rating} از ۵
              </div>
            </div>
            {row.comment && <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-600">{row.comment}</p>}
            <time className="mt-2 block text-xs text-gray-400">{new Date(row.updated_at).toLocaleDateString("fa-IR")}</time>
          </article>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <Button variant="outline" disabled={!data.previous || loading} onClick={() => setPage((value) => Math.max(1, value - 1))}>صفحه قبل</Button>
        <span className="text-xs text-gray-500">صفحه {page}</span>
        <Button variant="outline" disabled={!data.next || loading} onClick={() => setPage((value) => value + 1)}>صفحه بعد</Button>
      </div>
    </div>
  );
}
