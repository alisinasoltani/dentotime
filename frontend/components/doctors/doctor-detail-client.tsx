"use client";

import { Heart, MapPin, Stethoscope } from "lucide-react";
import useSWR from "swr";
import { toast } from "sonner";

import { DoctorRatingSection } from "@/components/doctors/doctor-rating-section";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getPublicDoctorDetail, toggleDoctorLike } from "@/lib/public-doctors";
import type { DoctorDetail, PaginatedResponse, Review } from "@/lib/types";


export function DoctorDetailClient({
  doctorId,
  initialDoctor,
}: {
  doctorId: string;
  initialDoctor: DoctorDetail | null;
  initialReviews: PaginatedResponse<Review>;
}) {
  const { data: doctor, isLoading, mutate } = useSWR(
    ["doctor-detail", doctorId],
    ([, id]) => getPublicDoctorDetail(id),
    {
      fallbackData: initialDoctor ?? undefined,
      dedupingInterval: 10_000,
      revalidateOnFocus: false,
    },
  );

  const likeDoctor = async () => {
    if (!doctor) return;
    try {
      const result = await toggleDoctorLike(doctor.id);
      await mutate(
        { ...doctor, is_liked: result.is_liked, likes_count: result.likes_count },
        false,
      );
    } catch {
      toast.error("ثبت علاقه‌مندی انجام نشد.");
    }
  };

  if (isLoading || !doctor) {
    return <Skeleton className="mx-auto my-8 h-96 max-w-3xl rounded-sm" />;
  }

  const doctorName = `دکتر ${doctor.first_name} ${doctor.last_name}`;
  return (
    <main className="min-h-screen bg-muted/40 pb-12" dir="rtl">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <article className="rounded-sm border border-border bg-background p-6 text-center sm:p-8">
          <Avatar className="mx-auto size-32 border-4 border-accent">
            <AvatarImage src={doctor.profile_picture || undefined} alt={doctorName} />
            <AvatarFallback className="bg-accent text-primary">
              <Stethoscope className="size-12" aria-hidden="true" />
            </AvatarFallback>
          </Avatar>
          <h1 className="mt-4 text-2xl font-bold text-foreground">{doctorName}</h1>
          <p className="mt-2 flex items-center justify-center gap-1 text-muted-foreground">
            <MapPin className="size-4" aria-hidden="true" />
            {doctor.clinic_name || "مطب خصوصی"}
          </p>
          <Button
            type="button"
            variant="ghost"
            className="mt-4"
            onClick={() => void likeDoctor()}
          >
            <Heart data-icon="inline-start" fill={doctor.is_liked ? "currentColor" : "none"} />
            {doctor.likes_count}
          </Button>
        </article>
        <DoctorRatingSection doctorIdentifier={doctorId} doctorName={doctorName} />
      </div>
    </main>
  );
}
