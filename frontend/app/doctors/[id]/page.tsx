import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Award, BriefcaseMedical, GraduationCap, MapPin, ShieldCheck, Star } from "lucide-react";

import { BookingButton } from "@/components/booking/BookingExperience";
import { DoctorRatingSection } from "@/components/doctors/doctor-rating-section";
import { getServerDoctorDetail } from "@/lib/server-public-doctors";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const dentist = await getServerDoctorDetail(id);
  return {
    title: dentist ? `دکتر ${dentist.first_name} ${dentist.last_name} | دنتوتایم` : "پزشک | دنتوتایم",
    description: dentist?.bio ?? "پروفایل دندان‌پزشک و رزرو نوبت آنلاین",
  };
}

export default async function DoctorProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const dentist = await getServerDoctorDetail(id);
  if (!dentist) notFound();

  const dentistServices = dentist.services;
  const doctorIdentifier = dentist.slug || String(dentist.id);
  const hasRatings = dentist.vote_count > 0;
  const averageRating = dentist.average_rating.toFixed(1);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#F3FBFC_0%,#FFFFFF_34%)] pb-20" dir="rtl">
      <div className="mx-auto max-w-[1080px] px-4 py-8 sm:px-6 sm:py-12">
        <Link href="/doctors" className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-[#5C6B6D] hover:text-[#2993A3]">
          <ArrowRight className="size-4" aria-hidden="true" /> بازگشت به فهرست پزشکان
        </Link>

        <article className="mt-4 grid overflow-hidden rounded-sm border border-[#CFE7EA] bg-white p-4 shadow-[0_24px_70px_rgba(50,139,154,0.12)] sm:p-6 lg:grid-cols-[0.78fr_1.22fr] lg:gap-8 lg:p-8">
          <div className="relative min-h-[320px] overflow-hidden rounded-sm bg-[#EFF9FB] sm:min-h-[430px] lg:min-h-[480px]">
            <Image src={dentist.profile_picture || "/images/logo.png"} alt={`دکتر ${dentist.first_name} ${dentist.last_name}`} fill sizes="(max-width: 1024px) 100vw, 42vw" className="object-cover object-top" priority />
          </div>
          <div className="flex flex-col justify-center px-1 py-6 sm:px-3 lg:py-4">
            <p className="text-sm font-bold text-[#2993A3]">{dentist.specialty}</p>
            <h1 className="mt-2 text-[32px] font-black text-[#111] sm:text-[46px]">دکتر {dentist.first_name} {dentist.last_name}</h1>
            <div className="mt-4 flex flex-wrap items-center gap-2" aria-label={hasRatings ? `میانگین امتیاز ${averageRating} از ۵ از مجموع ${dentist.vote_count} امتیاز` : "هنوز امتیازی ثبت نشده است"}>
              <span className="flex items-center gap-0.5">
                {[1, 2, 3, 4, 5].map((star) => <Star key={star} className={hasRatings && star <= Math.round(dentist.average_rating) ? "size-5 fill-[#F7B731] text-[#F7B731]" : "size-5 text-[#D5DEE0]"} aria-hidden="true" />)}
              </span>
              {hasRatings ? (
                <>
                  <strong className="text-sm text-[#444]">{averageRating}</strong>
                  <span className="text-sm text-[#777]">از {dentist.vote_count} امتیاز</span>
                </>
              ) : <strong className="text-sm text-[#777]">بدون امتیاز</strong>}
            </div>
            <p className="mt-6 whitespace-pre-wrap break-words text-[15px] leading-8 text-[#555] sm:text-base">{dentist.bio || "معرفی پزشک هنوز ثبت نشده است."}</p>

            <dl className="mt-7 grid gap-4 border-y border-[#E2EFF1] py-5 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-[#777]">سابقه حرفه‌ای</dt>
                <dd className="mt-1 break-words text-sm font-extrabold text-[#333]">{dentist.experience || "هنوز ثبت نشده است"}</dd>
              </div>
              <div>
                <dt className="text-xs text-[#777]">محل فعالیت</dt>
                <dd className="mt-1 break-words text-sm font-extrabold text-[#333]">{dentist.clinic_name || "هنوز ثبت نشده است"}</dd>
              </div>
            </dl>

            <BookingButton serviceSlug={dentist.services[0]?.slug} className="mt-7 h-12 w-full bg-[linear-gradient(90deg,#2993A3_0%,#75C1C7_100%)] text-base font-bold text-white shadow-[0_12px_28px_rgba(41,147,163,0.22)] sm:w-fit">رزرو نوبت</BookingButton>
          </div>
        </article>

        <DoctorRatingSection
          doctorIdentifier={doctorIdentifier}
          doctorName={`دکتر ${dentist.first_name} ${dentist.last_name}`}
        />

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
          <section className="rounded-sm border border-[#D6E9EC] bg-white p-5 sm:p-8" aria-labelledby="resume-title">
            <h2 id="resume-title" className="text-2xl font-black text-[#222] sm:text-3xl">رزومه و سوابق حرفه‌ای</h2>
            <div className="mt-7 flex flex-col gap-7">
              <ResumeItem icon={GraduationCap} title="تحصیلات تخصصی" text={dentist.education} />
              <ResumeItem icon={BriefcaseMedical} title="تجربه بالینی" text={dentist.clinical_history} />
              <ResumeItem icon={Award} title="دوره‌ها و گواهی‌های تکمیلی" text={dentist.certifications} />
            </div>

            <div className="mt-9 border-t border-[#E2EFF1] pt-7">
              <h3 className="text-lg font-black text-[#222]">خدمات قابل رزرو</h3>
              <div className="mt-4 flex flex-wrap gap-2">
                {dentistServices.map((service) => (
                  <Link key={service.slug} href={`/services/${service.slug}`} className="rounded-sm border border-[#BDE0E5] bg-[#F7FCFC] px-4 py-2 text-sm font-bold text-[#397A84] hover:bg-[#E7F7F8]">{service.short_title}</Link>
                ))}
              </div>
            </div>
          </section>

          <aside className="flex flex-col gap-5">
            <section className="rounded-sm border border-[#D6E9EC] bg-white p-5 sm:p-6" aria-labelledby="insurance-profile-title">
              <div className="flex items-center gap-3">
                <span className="flex size-11 items-center justify-center rounded-sm bg-[#E1FCFC] text-[#2993A3]"><ShieldCheck className="size-5" /></span>
                <h2 id="insurance-profile-title" className="text-lg font-black text-[#222]">بیمه‌های طرف قرارداد</h2>
              </div>
              <ul className="mt-5 flex flex-col gap-2">
                {dentist.insurances.map((insurance) => <li key={insurance.id} className="flex items-center gap-2 text-sm text-[#555]"><span className="size-1.5 rounded-full bg-[#75C1C7]" />{insurance.name}</li>)}
                {dentist.insurances.length === 0 && <li className="text-sm text-[#555]">هنوز بیمه‌ای ثبت نشده است.</li>}
              </ul>
            </section>

            <section className="rounded-sm border border-[#D6E9EC] bg-white p-5 sm:p-6" aria-labelledby="address-title">
              <div className="flex items-center gap-3">
                <span className="flex size-11 items-center justify-center rounded-sm bg-[#E1FCFC] text-[#2993A3]"><MapPin className="size-5" /></span>
                <h2 id="address-title" className="text-lg font-black text-[#222]">آدرس مطب</h2>
              </div>
              <p className="mt-5 whitespace-pre-wrap break-words text-sm leading-7 text-[#555]">{dentist.address || "آدرس هنوز ثبت نشده است."}</p>
              {/^https?:\/\//i.test(dentist.map_url) && <a href={dentist.map_url} target="_blank" rel="noreferrer" className="mt-5 inline-flex min-h-11 items-center text-sm font-bold text-[#2993A3] hover:underline">مشاهده روی نقشه</a>}
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}

function ResumeItem({
  icon: Icon,
  title,
  text,
}: {
  icon: typeof Award;
  title: string;
  text: string;
}) {
  return (
    <div className="grid grid-cols-[44px_1fr] gap-4">
      <span className="flex size-11 items-center justify-center rounded-sm bg-[#EFF9FB] text-[#2993A3]"><Icon className="size-5" /></span>
      <div>
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="font-extrabold text-[#333]">{title}</h3>
        </div>
        <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7 text-[#606B6D]">{text || "هنوز توسط پزشک ثبت نشده است."}</p>
      </div>
    </div>
  );
}
