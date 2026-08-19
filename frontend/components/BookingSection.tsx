"use client";

import { useState } from "react";
import { CheckCircle2, ShieldCheck, Stethoscope } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useBookingExperience } from "@/components/booking/BookingExperience";
import { insurers, services } from "@/lib/site-data";

export default function BookingSection() {
  const [service, setService] = useState("");
  const [insurance, setInsurance] = useState("");
  const { openBooking } = useBookingExperience();

  return (
    <section id="booking" className="scroll-mt-28 py-16 sm:py-20 lg:py-28" dir="rtl">
      <div className="mx-auto max-w-[1180px] px-4 sm:px-6">
        <div className="overflow-hidden rounded-[12px] border border-[#9BD8E4] shadow-[0_12px_20px_rgba(44,139,153,0.12)] px-5 py-10 sm:px-8 sm:py-13 lg:px-10 lg:py-20">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-[28px] font-black text-[#111] sm:text-[36px]">رزرو نوبت آنلاین</h2>
              <p className="mt-2 text-[15px] leading-7 text-[#666] sm:text-base">خدمت و بیمه را انتخاب کنید تا پزشکان مرتبط را ببینید.</p>
              <p className="inline-flex items-center gap-2 text-sm text-[#52767C]">
                {/* <ShieldCheck className="size-5 text-[#2993A3]" aria-hidden="true" /> */}
                قیمت نهایی پیش از پرداخت نمایش داده می‌شود.
              </p>
            </div>
          </div>

          <div className="mt-8 grid gap-8 md:gap-3 lg:grid-cols-[1.4fr_1fr_auto] lg:items-end">
            <label className="flex flex-col gap-2 text-sm font-bold text-[#444]">
              <span className="inline-flex items-center gap-2">
                {/* <Stethoscope className="size-4 text-[#2993A3]" />  */}
                ۱. انتخاب خدمت
              </span>
              <Select
                value={service}
                onValueChange={(value) => {
                  setService(value);
                  setInsurance("");
                }}
              >
                <SelectTrigger className="h-14 w-full rounded-sm border-[#BFDDE2] bg-white px-4 text-right shadow-[0_8px_22px_rgba(50,139,154,0.06)]">
                  <SelectValue placeholder="خدمت مورد نظر" />
                </SelectTrigger>
                <SelectContent position="popper" align="start">
                  <SelectGroup>
                    {services.map((item) => (
                      <SelectItem key={item.slug} value={item.slug}>{item.title}</SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </label>

            <label className="flex flex-col gap-2 text-sm font-bold text-[#444]" data-disabled={!service}>
              <span className="inline-flex items-center gap-2">
                {/* <ShieldCheck className="size-4 text-[#2993A3]" />  */}
                ۲. انتخاب نوع بیمه
              </span>
              <Select value={insurance} onValueChange={setInsurance} disabled={!service}>
                <SelectTrigger className="h-14 w-full rounded-sm border-[#BFDDE2] bg-white px-4 text-right shadow-[0_8px_22px_rgba(50,139,154,0.06)]">
                  <SelectValue placeholder={service ? "بیمه تحت پوشش" : "ابتدا خدمت را انتخاب کنید"} />
                </SelectTrigger>
                <SelectContent position="popper" align="start">
                  <SelectGroup>
                    {insurers.map((item) => (
                      <SelectItem key={item} value={item}>{item}</SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </label>

            <Button
              type="button"
              disabled={!service || !insurance}
              onClick={() => openBooking(service, insurance)}
              className="h-14 rounded-sm bg-[linear-gradient(90deg,#2993A3_0%,#75C1C7_100%)] px-7 text-base font-bold text-white shadow-[0_10px_26px_rgba(41,147,163,0.22)] hover:brightness-95"
            >
              <CheckCircle2 data-icon="inline-start" />
              مشاهده پزشکان و ادامه
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
