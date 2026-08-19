"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ShieldCheck, Star } from "lucide-react";

import { dentists, insurers } from "@/lib/site-data";

const loopedDentists = [...dentists, ...dentists, ...dentists];
const marqueeInsurers = [...insurers.filter((item) => item !== "آزاد"), ...insurers.filter((item) => item !== "آزاد")];

export default function DoctorsPreview() {
  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.scrollLeft = viewport.scrollWidth / 3;
  }, []);

  const move = (direction: "left" | "right") => {
    viewportRef.current?.scrollBy({
      left: direction === "left" ? -300 : 300,
      behavior: "smooth",
    });
  };

  const keepInfinite = () => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const segment = viewport.scrollWidth / 3;
    if (viewport.scrollLeft < segment * 0.35) viewport.scrollLeft += segment;
    if (viewport.scrollLeft > segment * 1.65) viewport.scrollLeft -= segment;
  };

  return (
    <>
      <section className="pb-16 sm:pb-20 lg:pb-28" dir="rtl" aria-labelledby="doctors-title">
        <div className="mx-auto w-full px-4 sm:px-6">
          <div className="mb-8 flex items-end justify-between gap-4 px-2 md:px-8">
            <div>
              <h2 id="doctors-title" className="text-[28px] font-black text-[#111] sm:text-[40px]">دندان‌پزشکان برتر</h2>
              <p className="mt-3 max-w-[620px] text-[15px] leading-7 text-[#666] sm:text-base">
                امتیاز هر پزشک از میانگین تمام نظرهای ثبت‌شده محاسبه می‌شود.
              </p>
            </div>
            <Link href="/doctors" className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-[#2993A3] hover:underline">
              مشاهده همه
              <ArrowLeft className="size-4" aria-hidden="true" />
            </Link>
          </div>

          <div className="relative">
            <button type="button" onClick={() => move("right")} className="absolute right-1 top-1/2 z-10 flex size-11 -translate-y-1/2 items-center justify-center rounded-full border border-[#9BD8E4] bg-white text-[#2993A3] shadow-[0_8px_24px_rgba(54,150,165,0.18)]" aria-label="پزشک بعدی">
              <ArrowRight className="size-5" />
            </button>
            <div
              ref={viewportRef}
              onScroll={keepInfinite}
              className="dento-scrollbar-hidden flex snap-x snap-mandatory gap-4 overflow-x-auto px-2 pb-12 pt-3"
              style={{ direction: "ltr" }}
            >
              {loopedDentists.map((dentist, index) => (
                <Link
                  key={`${dentist.id}-${index}`}
                  href={`/doctors/${dentist.id}`}
                  dir="rtl"
                  className="group w-[76vw] max-w-[270px] shrink-0 snap-start overflow-hidden rounded-[22px] border border-[#D4E8EB] bg-white p-3 transition duration-300 hover:-translate-y-1 hover:border-[#75C1C7] hover:shadow-[0_18px_42px_rgba(50,139,154,0.14)] focus-visible:outline-3 focus-visible:outline-[#75C1C7]/50"
                >
                  <Image src={dentist.image} alt={`دکتر ${dentist.firstName} ${dentist.lastName}`} width={480} height={360} sizes="270px" className="aspect-[4/3] w-full rounded-[16px] bg-[#EFF9FB] object-cover object-top" />
                  <div className="px-2 pb-2 pt-4">
                    <h3 className="text-base font-extrabold text-[#222]">دکتر {dentist.firstName} {dentist.lastName}</h3>
                    <p className="mt-1 truncate text-xs text-[#666]">{dentist.specialty}</p>
                    <div className="mt-4 flex items-center gap-1" aria-label={`امتیاز ${dentist.rating} از ۵ از مجموع ${dentist.reviews} نظر`}>
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star key={star} className="size-3.5 fill-[#F7B731] text-[#F7B731]" aria-hidden="true" />
                      ))}
                      <span className="mr-1 text-[11px] font-bold text-[#555]">{dentist.rating}</span>
                      <span className="text-[11px] text-[#888]">({dentist.reviews} نظر)</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
            <button type="button" onClick={() => move("left")} className="absolute left-1 top-1/2 z-10 flex size-11 -translate-y-1/2 items-center justify-center rounded-full border border-[#9BD8E4] bg-white text-[#2993A3] shadow-[0_8px_24px_rgba(54,150,165,0.18)]" aria-label="پزشک قبلی">
              <ArrowLeft className="size-5" />
            </button>
          </div>
        </div>
      </section>

      <section className="overflow-hidden border-y border-[#E0F1F3] bg-[#F8FDFD] py-10 sm:py-12" dir="rtl" aria-labelledby="insurance-title">
        <div className="mx-auto max-w-[1180px] px-4 sm:px-6">
          <div className="mb-7 flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-2xl bg-[#E1FCFC] text-[#2993A3]">
              <ShieldCheck className="size-6" aria-hidden="true" />
            </span>
            <div>
              <h2 id="insurance-title" className="text-2xl font-black text-[#111] sm:text-3xl">بیمه‌های تحت پوشش</h2>
              <p className="mt-1 text-sm text-[#777]">پوشش دقیق هر خدمت در مرحله رزرو بررسی می‌شود.</p>
            </div>
            <a href="#booking" className="mr-auto inline-flex min-h-11 items-center gap-2 text-sm font-bold text-[#2993A3] hover:underline">
              <ArrowRight className="size-4" aria-hidden="true" /> مشاهده همه
            </a>
          </div>
        </div>
        <div className="dento-marquee-mask overflow-hidden" aria-label="فهرست بیمه‌های تحت پوشش">
          <div className="dento-insurance-marquee flex w-max items-center gap-3 px-3" role="list">
            {marqueeInsurers.map((insurer, index) => (
              <div key={`${insurer}-${index}`} role="listitem" className="flex h-16 min-w-[190px] items-center justify-center rounded-2xl border border-[#D6ECEF] bg-white px-6 text-center text-sm font-extrabold text-[#396A72] shadow-[0_8px_24px_rgba(54,150,165,0.07)]">
                {insurer}
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
