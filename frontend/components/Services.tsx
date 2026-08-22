"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import {
  Activity,
  AlignCenter,
  ArrowLeft,
  ArrowRight,
  Baby,
  CircleDot,
  MessagesSquare,
  ScanFace,
  ScanLine,
  Search,
  Shield,
  Sparkles,
  Stethoscope,
  WandSparkles,
  type LucideIcon,
} from "lucide-react";

import type { DentalService } from "@/lib/types";

const iconMap: Record<string, LucideIcon> = {
  messages: MessagesSquare,
  sparkles: Sparkles,
  "scan-face": ScanFace,
  activity: Activity,
  stethoscope: Stethoscope,
  "align-center": AlignCenter,
  shield: Shield,
  baby: Baby,
  wand: WandSparkles,
  search: Search,
  "scan-line": ScanLine,
  "circle-dot": CircleDot,
};

export default function Services({ services }: { services: DentalService[] }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const loopedServices = [...services, ...services, ...services];

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const segment = viewport.scrollWidth / 3;
    viewport.scrollLeft = segment;
  }, []);

  const move = (direction: "left" | "right") => {
    viewportRef.current?.scrollBy({
      left: direction === "left" ? -280 : 280,
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
    <section id="services" className="w-full scroll-mt-28 py-12 sm:py-16 lg:py-20" dir="rtl">
      <div className="mx-auto w-full px-4 sm:px-6">
        <div className="mb-8 px-2 md:px-8 flex flex-col md:flex-row md:items-end justify-between gap-0 md:gap-4">
          <div>
            <h2 className="text-[28px] font-black text-[#111] sm:text-[36px]">خدمات و تخصص‌ها</h2>
            <p className="mt-3 max-w-[620px] text-[15px] leading-7 text-[#666] sm:text-base">
              خدمت مورد نیازتان را انتخاب کنید تا پزشکان و مراکز درمانی مرتبط را ببینید.
            </p>
          </div>
          <Link href="#services" className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-[#2993A3] hover:underline">
            مشاهده همه
            <ArrowLeft className="size-4" aria-hidden="true" />
          </Link>
        </div>

        <div className="relative">
          <button type="button" onClick={() => move("right")} className="absolute right-1 top-1/2 z-10 flex size-11 -translate-y-1/2 items-center justify-center rounded-full border border-[#9BD8E4] bg-white text-[#2993A3] shadow-[0_8px_24px_rgba(54,150,165,0.18)]" aria-label="خدمت بعدی">
            <ArrowRight className="size-5" />
          </button>
          <div
            ref={viewportRef}
            onScroll={keepInfinite}
            className="dento-scrollbar-hidden flex snap-x snap-mandatory gap-4 overflow-x-auto px-2 pt-3 pb-12"
            style={{ direction: "ltr" }}
          >
            {loopedServices.map((service, index) => {
              const Icon = iconMap[service.icon] ?? Stethoscope;
              return (
                <Link
                  key={`${service.slug}-${index}`}
                  href={`/services/${service.slug}`}
                  className="group min-h-[248px] w-[78vw] max-w-[280px] shrink-0 snap-start rounded-[22px] border border-[#B1B1B1] bg-white p-6 text-right transition duration-300 hover:-translate-y-1 hover:border-[#75C1C7] hover:bg-[linear-gradient(145deg,#F5FCFC_0%,#EEF9FB_36%,#E6F5FA_70%,#DFF0F7_100%)] hover:shadow-[0_18px_42px_rgba(50,139,154,0.15)] focus-visible:outline-3 focus-visible:outline-[#75C1C7]/50"
                  dir="rtl"
                >
                  <span className="flex size-14 items-center justify-center rounded-[18px] bg-[#E8F7F8] text-[#2993A3] transition group-hover:bg-white">
                    <Icon className="size-7" strokeWidth={1.8} aria-hidden="true" />
                  </span>
                  <h3 className="mt-7 text-lg font-extrabold leading-7 text-[#222]">{service.title}</h3>
                  <p className="mt-3 line-clamp-2 text-sm leading-7 text-[#666]">{service.description}</p>
                  <span className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-[#2993A3]">
                    یافتن پزشک
                    <ArrowLeft className="size-4 transition group-hover:-translate-x-1" aria-hidden="true" />
                  </span>
                </Link>
              );
            })}
          </div>
          <button type="button" onClick={() => move("left")} className="absolute left-1 top-1/2 z-10 flex size-11 -translate-y-1/2 items-center justify-center rounded-full border border-[#9BD8E4] bg-white text-[#2993A3] shadow-[0_8px_24px_rgba(54,150,165,0.18)]" aria-label="خدمت قبلی">
            <ArrowLeft className="size-5" />
          </button>
        </div>
      </div>
    </section>
  );
}
