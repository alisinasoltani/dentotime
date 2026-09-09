"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useBookingExperience } from "@/components/booking/BookingExperience";
import type { DentalService, InsuranceProvider } from "@/lib/types";

export default function BookingSection({
  services,
  insurances,
}: {
  services: DentalService[];
  insurances: InsuranceProvider[];
}) {
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
              <p className="mt-2 text-[15px] leading-7 text-[#666] sm:text-base">ابتدا بیمه و سپس خدمت را انتخاب کنید تا پزشکان مرتبط را ببینید.</p>
              <p className="inline-flex items-center gap-2 text-sm text-[#52767C]">
                {/* <ShieldCheck className="size-5 text-[#2993A3]" aria-hidden="true" /> */}
                قیمت نهایی پیش از پرداخت نمایش داده می‌شود.
              </p>
            </div>
          </div>

          <div className="mt-8 grid gap-8 md:gap-3 lg:grid-cols-[1.4fr_1fr_auto] lg:items-end">
            <FieldGroup className="contents">
              <Field>
                <FieldLabel htmlFor="home-booking-insurance">۱. انتخاب نوع بیمه</FieldLabel>
                <Select dir="rtl" value={insurance} onValueChange={setInsurance}>
                  <SelectTrigger id="home-booking-insurance" className="h-14 w-full"><SelectValue placeholder="بیمه تحت پوشش" /></SelectTrigger>
                  <SelectContent position="popper" align="start"><SelectGroup>
                    {insurances.map(item => <SelectItem key={item.id} value={item.name}>{item.name}</SelectItem>)}
                  </SelectGroup></SelectContent>
                </Select>
              </Field>
              <Field data-disabled={!insurance}>
                <FieldLabel htmlFor="home-booking-service">۲. انتخاب خدمت</FieldLabel>
                <Select dir="rtl" value={service} onValueChange={setService} disabled={!insurance}>
                  <SelectTrigger id="home-booking-service" className="h-14 w-full"><SelectValue placeholder={insurance ? "خدمت مورد نظر" : "ابتدا بیمه را انتخاب کنید"} /></SelectTrigger>
                  <SelectContent position="popper" align="start"><SelectGroup>
                    {services.map(item => <SelectItem key={item.id} value={item.slug}>{item.title}</SelectItem>)}
                  </SelectGroup></SelectContent>
                </Select>
              </Field>
            </FieldGroup>

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
