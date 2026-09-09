"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import Link from "next/link";
import { MapPin, Search, Star } from "lucide-react";

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
import type { InsuranceProvider, PublicDoctor } from "@/lib/types";

export function AllDoctorsDirectory({
  doctors,
  insurances,
}: {
  doctors: PublicDoctor[];
  insurances: InsuranceProvider[];
}) {
  const [query, setQuery] = useState("");
  const [insurance, setInsurance] = useState("all");

  const results = useMemo(() => {
    const normalized = query.trim();
    return doctors
      .filter((dentist) => !normalized || `${dentist.first_name} ${dentist.last_name} ${dentist.specialty} ${dentist.clinic_name}`.includes(normalized))
      .filter((dentist) => insurance === "all" || insurance === "آزاد" || dentist.insurances.some((item) => item.name === insurance))
      .toSorted((a, b) => b.average_rating - a.average_rating);
  }, [doctors, insurance, query]);

  return (
    <main className="min-h-screen bg-white pb-20" dir="rtl">
      <section className="py-12 sm:py-16">
        <div className="mx-auto max-w-[1180px] px-4 sm:px-6">
          <h1 className="text-[34px] font-black text-[#111] sm:text-[48px]">پزشکان دنتوتایم</h1>
          <p className="mt-4 max-w-[720px] text-[15px] leading-8 text-[#666] sm:text-base">تخصص، امتیاز کاربران، محل فعالیت و بیمه‌های طرف قرارداد را پیش از رزرو مقایسه کنید.</p>

          <div className="mt-8 grid gap-3 rounded-sm border border-[#D5EAED] bg-white p-4 shadow-[0_14px_40px_rgba(50,139,154,0.08)] md:grid-cols-[1fr_0.55fr]">
            <label className="flex flex-col gap-2 text-sm font-bold text-[#444]">
              جستجوی پزشک
              <div className="relative">
                <Search className="pointer-events-none absolute right-4 top-1/2 size-5 -translate-y-1/2 text-[#75A4AB]" />
                <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="نام، تخصص یا مرکز درمانی" className="h-12 rounded-sm border-[#CFE5E8] pr-11" />
              </div>
            </label>
            <label className="flex flex-col gap-2 text-sm font-bold text-[#444]">
              بیمه تحت پوشش
              <Select value={insurance} onValueChange={setInsurance}>
                <SelectTrigger className="h-12 w-full rounded-sm border-[#CFE5E8] px-4 text-right"><SelectValue /></SelectTrigger>
                <SelectContent position="popper" align="start">
                  <SelectGroup>
                    <SelectItem value="all">همه بیمه‌ها</SelectItem>
                    {insurances.map((item) => <SelectItem key={item.id} value={item.name}>{item.name}</SelectItem>)}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </label>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {results.map((dentist) => {
              const hasRatings = dentist.vote_count > 0;
              return (
              <article key={dentist.id} className="flex flex-col overflow-hidden rounded-sm border border-[#D5E8EB] bg-white p-3 shadow-[0_12px_34px_rgba(50,139,154,0.07)] transition hover:-translate-y-1 hover:border-[#75C1C7] hover:shadow-[0_18px_42px_rgba(50,139,154,0.13)]">
                <Link href={`/doctors/${dentist.slug || dentist.id}`} className="rounded-sm focus-visible:outline-3 focus-visible:outline-[#75C1C7]/45">
                  <Image src={dentist.profile_picture || "/images/logo.png"} alt={`دکتر ${dentist.first_name} ${dentist.last_name}`} width={480} height={360} sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw" className="aspect-[4/3] w-full rounded-sm bg-[#EFF9FB] object-cover object-top" />
                  <div className="px-2 pt-4">
                    <h2 className="text-lg font-black text-[#222]">دکتر {dentist.first_name} {dentist.last_name}</h2>
                    <p className="mt-1 text-sm text-[#555]">{dentist.specialty}</p>
                    <div className="mt-3 flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star
                          key={star}
                          className={hasRatings && star <= Math.round(dentist.average_rating)
                            ? "size-3.5 fill-[#F7B731] text-[#F7B731]"
                            : "size-3.5 text-[#D5DEE0]"}
                        />
                      ))}
                      {hasRatings ? (
                        <>
                          <span className="mr-1 text-[11px] font-bold text-[#555]">{dentist.average_rating.toFixed(1)}</span>
                          <span className="text-[11px] text-[#888]">({dentist.vote_count} نظر)</span>
                        </>
                      ) : (
                        <span className="mr-1 text-[11px] font-bold text-[#777]">بدون امتیاز</span>
                      )}
                    </div>
                    <p className="mt-3 flex items-start gap-1.5 text-xs leading-6 text-[#777]"><MapPin className="mt-1 size-3.5 shrink-0 text-[#2993A3]" />{dentist.address}</p>
                  </div>
                </Link>
                <BookingButton serviceSlug={dentist.services[0]?.slug} className="mt-5 w-full">رزرو نوبت</BookingButton>
              </article>
              );
            })}
          </div>
        </div>
      </section>
    </main>
  );
}
