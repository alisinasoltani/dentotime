"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, MapPin, Search, ShieldCheck, Star } from "lucide-react";

import { BookingButton } from "@/components/booking/BookingExperience";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { DentalService, InsuranceProvider, PublicDoctor } from "@/lib/types";

export function ServiceDirectory({
  service,
  doctors,
  insurances,
}: {
  service: DentalService;
  doctors: PublicDoctor[];
  insurances: InsuranceProvider[];
}) {
  const [search, setSearch] = useState("");
  const [insurance, setInsurance] = useState("all");
  const [sort, setSort] = useState("rating");

  const results = useMemo(() => {
    const query = search.trim();
    return doctors
      .filter((dentist) => dentist.services.some((item) => item.slug === service.slug))
      .filter((dentist) => {
        if (!query) return true;
        return `${dentist.first_name} ${dentist.last_name} ${dentist.specialty} ${dentist.clinic_name}`.includes(query);
      })
      .filter((dentist) => insurance === "all" || insurance === "آزاد" || dentist.insurances.some((item) => item.name === insurance))
      .toSorted((a, b) => (sort === "reviews" ? b.vote_count - a.vote_count : b.average_rating - a.average_rating));
  }, [doctors, insurance, search, service.slug, sort]);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#F8FDFD_0%,#FFFFFF_38%)] pb-20" dir="rtl">
      <section className="border-b border-[#DDEFF1] bg-white py-10 sm:py-14">
        <div className="mx-auto max-w-[1180px] px-4 sm:px-6">
          <Link href="/#services" className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-[#5C6B6D] hover:text-[#2993A3]">
            <ArrowRight className="size-4" aria-hidden="true" /> بازگشت به خدمات
          </Link>
          <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-[32px] font-black leading-[1.45] text-[#111] sm:text-[46px]">{service.title}</h1>
              <p className="mt-3 max-w-[680px] text-[15px] leading-8 text-[#666] sm:text-base">{service.description}. پزشک و پوشش بیمه را مقایسه کنید و بدون خروج از صفحه نوبت بگیرید.</p>
            </div>
            <div className="flex items-center gap-2 rounded-2xl bg-[#E9F8F9] px-4 py-3 text-sm font-bold text-[#2993A3]">
              <ShieldCheck className="size-5" aria-hidden="true" />
              نتیجه‌های منطبق با این خدمت
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1180px] px-4 py-8 sm:px-6 sm:py-10">
        <div className="grid gap-3 rounded-[22px] border border-[#D5EAED] bg-white p-4 shadow-[0_14px_40px_rgba(50,139,154,0.08)] md:grid-cols-[1.5fr_0.8fr_0.8fr]">
          <label className="flex flex-col gap-2 text-sm font-bold text-[#444]">
            جستجو
            <div className="relative">
              <Search className="pointer-events-none absolute right-4 top-1/2 size-5 -translate-y-1/2 text-[#75A4AB]" aria-hidden="true" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="نام پزشک یا مرکز درمانی" className="h-12 rounded-2xl border-[#CFE5E8] pr-11" />
            </div>
          </label>
          <label className="flex flex-col gap-2 text-sm font-bold text-[#444]">
            نوع بیمه
            <Select value={insurance} onValueChange={setInsurance}>
              <SelectTrigger className="h-12 w-full rounded-2xl border-[#CFE5E8] px-4 text-right">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" align="start">
                <SelectGroup>
                  <SelectItem value="all">همه بیمه‌ها</SelectItem>
                  {insurances.map((item) => <SelectItem key={item.id} value={item.name}>{item.name}</SelectItem>)}
                </SelectGroup>
              </SelectContent>
            </Select>
          </label>
          <label className="flex flex-col gap-2 text-sm font-bold text-[#444]">
            مرتب‌سازی
            <Select value={sort} onValueChange={setSort}>
              <SelectTrigger className="h-12 w-full rounded-2xl border-[#CFE5E8] px-4 text-right">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" align="start">
                <SelectGroup>
                  <SelectItem value="rating">بیشترین امتیاز</SelectItem>
                  <SelectItem value="reviews">بیشترین تعداد نظر</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </label>
        </div>

        <div className="mt-6 flex items-center justify-between gap-4">
          <h2 className="text-lg font-black text-[#222]">پزشکان و مراکز ارائه‌دهنده</h2>
          <span className="text-sm text-[#777]">{results.length} نتیجه</span>
        </div>

        <div className="mt-4 flex flex-col gap-3">
          {results.map((dentist) => (
            <article key={dentist.id} className="grid items-center gap-4 rounded-[22px] border border-[#D7E9EC] bg-white p-4 shadow-[0_10px_30px_rgba(50,139,154,0.06)] transition hover:border-[#75C1C7] md:grid-cols-[1.25fr_1fr_auto] md:p-5">
              <Link href={`/doctors/${dentist.slug || dentist.id}`} className="flex min-w-0 items-center gap-4 rounded-xl focus-visible:outline-3 focus-visible:outline-[#75C1C7]/45">
                <Image src={dentist.profile_picture || "/images/logo.png"} alt={`دکتر ${dentist.first_name} ${dentist.last_name}`} width={96} height={96} sizes="96px" className="size-20 shrink-0 rounded-[18px] bg-[#EFF9FB] object-cover object-top sm:size-24" />
                <div className="min-w-0">
                  <h3 className="truncate text-lg font-black text-[#222]">دکتر {dentist.first_name} {dentist.last_name}</h3>
                  <p className="mt-1 truncate text-sm text-[#555]">{dentist.specialty}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="flex items-center gap-0.5" aria-hidden="true">
                      {[1, 2, 3, 4, 5].map((star) => <Star key={star} className="size-3.5 fill-[#F7B731] text-[#F7B731]" />)}
                    </span>
                    <span className="text-[11px] font-bold text-[#555]">{dentist.average_rating}</span>
                    <span className="text-[11px] text-[#888]">({dentist.vote_count} نظر)</span>
                  </div>
                </div>
              </Link>

              <div className="min-w-0 border-[#E3EFF1] md:border-r md:pr-5">
                <p className="flex items-start gap-2 text-xs leading-6 text-[#666]">
                  <MapPin className="mt-1 size-4 shrink-0 text-[#2993A3]" aria-hidden="true" />
                  {dentist.address}
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {dentist.insurances.slice(0, 3).map((item) => <span key={item.id} className="rounded-full border border-[#CFE7EA] bg-[#F7FCFC] px-2.5 py-1 text-[11px] text-[#4C747A]">{item.name}</span>)}
                </div>
              </div>

              <BookingButton serviceSlug={service.slug} className="w-full md:w-auto">رزرو نوبت</BookingButton>
            </article>
          ))}

          {results.length === 0 && (
            <div className="rounded-[22px] border border-dashed border-[#BFDDE2] bg-white p-10 text-center">
              <p className="font-bold text-[#444]">پزشکی با این فیلترها پیدا نشد.</p>
              <p className="mt-2 text-sm text-[#777]">نوع بیمه را روی «همه بیمه‌ها» یا «آزاد» قرار دهید.</p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
