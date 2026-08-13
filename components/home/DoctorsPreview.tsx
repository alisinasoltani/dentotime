import Link from "next/link";
import { Heart, Star, Stethoscope } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getServerDoctorPreview } from "@/lib/server-public-doctors";


export default async function DoctorsPreview() {
  const doctors = await getServerDoctorPreview();
  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8" dir="rtl">
      <div className="mb-10 flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-900 md:text-3xl">پزشکان ما</h2>
        <Link href="/doctors" className="text-sm font-bold text-[#2993A3] hover:text-[#1f7b89]">
          مشاهده همه
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {doctors.map((doctor) => (
          <Link
            href={`/doctors/${doctor.id}`}
            key={doctor.id}
            className="doctor-list-item flex flex-col items-center rounded-2xl border border-gray-100 bg-white p-6 text-center shadow-sm transition-all hover:-translate-y-1 hover:shadow-md"
          >
            <Avatar className="mb-4 h-20 w-20 border-2 border-[#5FB4FF]">
              <AvatarImage src={doctor.profile_picture || undefined} />
              <AvatarFallback className="bg-[#E9F5F9] text-[#2993A3]">
                <Stethoscope className="h-8 w-8" />
              </AvatarFallback>
            </Avatar>
            <h3 className="mb-1 font-bold text-slate-800">
              دکتر {doctor.first_name} {doctor.last_name}
            </h3>
            <p className="mb-3 text-xs text-gray-500">{doctor.clinic_name || "مطب خصوصی"}</p>
            <div className="flex items-center gap-1 text-sm font-bold text-[#2993A3]">
              <Heart className="h-4 w-4" fill="currentColor" />
              {doctor.likes_count || 0} لایک
            </div>
            <div className="mt-1 flex items-center gap-1 text-xs font-semibold text-yellow-600">
              <Star className="h-3.5 w-3.5" fill="currentColor" />
              {doctor.average_rating.toFixed(1)} ({doctor.vote_count} رأی)
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
