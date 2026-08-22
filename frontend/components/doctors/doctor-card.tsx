import Link from "next/link";
import { ChevronLeft, Heart, Star, Stethoscope } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { PublicDoctor } from "@/lib/types";


export function DoctorCard({ doctor }: { doctor: PublicDoctor }) {
  const hasRatings = doctor.vote_count > 0;
  return (
    <Link
      href={`/doctors/${doctor.id}`}
      className="doctor-list-item flex items-center gap-4 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm transition-all hover:border-[#5FB4FF] hover:shadow-md"
    >
      <Avatar className="h-16 w-16 shrink-0 border-2 border-[#5FB4FF]">
        <AvatarImage src={doctor.profile_picture || undefined} />
        <AvatarFallback className="bg-[#E9F5F9] text-[#2993A3]">
          <Stethoscope className="h-6 w-6" />
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <h2 className="truncate font-bold text-slate-800">
          دکتر {doctor.first_name} {doctor.last_name}
        </h2>
        <p className="mb-2 truncate text-sm text-gray-500">
          {doctor.clinic_name || "مطب خصوصی"}
        </p>
        <div className="flex items-center gap-1 text-xs font-bold text-[#2993A3]">
          <Heart className="h-3.5 w-3.5" fill="currentColor" />
          {doctor.likes_count || 0} لایک
        </div>
        <div className="mt-1 flex items-center gap-1 text-xs font-semibold text-yellow-600">
          <Star className="h-3.5 w-3.5" fill="currentColor" />
          {hasRatings
            ? `${doctor.average_rating.toFixed(1)} از ۵ (${doctor.vote_count} رأی)`
            : "بدون امتیاز"}
        </div>
      </div>
      <ChevronLeft className="h-5 w-5 text-gray-400" />
    </Link>
  );
}
