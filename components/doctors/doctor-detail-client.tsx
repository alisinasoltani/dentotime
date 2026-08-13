"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { ArrowRight, Heart, MapPin, Star, Stethoscope } from "lucide-react";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { getCurrentUser, restoreSession } from "@/lib/auth";
import {
  getDoctorReviews,
  getPublicDoctorDetail,
  submitDoctorReview,
  toggleDoctorLike,
} from "@/lib/public-doctors";
import type {
  DoctorDetail,
  PaginatedResponse,
  Review,
  UserRole,
} from "@/lib/types";


export function DoctorDetailClient({
  doctorId,
  initialDoctor,
  initialReviews,
}: {
  doctorId: string;
  initialDoctor: DoctorDetail | null;
  initialReviews: PaginatedResponse<Review>;
}) {
  const router = useRouter();
  const [viewerRole, setViewerRole] = useState<UserRole | null>(null);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [isLiking, setIsLiking] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [additionalReviewPages, setAdditionalReviewPages] = useState<PaginatedResponse<Review>[]>([]);

  const { data: doctor, isLoading, mutate: mutateDoctor } = useSWR(
    ["doctor-detail", doctorId],
    ([, id]) => getPublicDoctorDetail(id),
    {
      fallbackData: initialDoctor ?? undefined,
      dedupingInterval: 10_000,
      revalidateOnFocus: false,
    },
  );
  const { data: firstReviews, mutate: mutateFirstReviews } = useSWR(
    ["doctor-reviews", doctorId, 1],
    ([, id]) => getDoctorReviews(id),
    {
      fallbackData: initialReviews,
      dedupingInterval: 10_000,
      revalidateOnFocus: false,
    },
  );

  useEffect(() => {
    let active = true;
    void restoreSession().then(async (authenticated) => {
      if (!active) return;
      setViewerRole(authenticated ? (await getCurrentUser()).role : null);
    });
    return () => { active = false; };
  }, []);

  const reviewPages = [firstReviews ?? initialReviews, ...additionalReviewPages];
  const reviews = reviewPages.flatMap((page) => page.results);
  const lastReviewPage = reviewPages.at(-1);

  const requirePatient = async () => {
    if (!(await restoreSession()) || viewerRole === null) {
      toast.error("برای انجام این کار ابتدا وارد حساب بیمار شوید.");
      router.push("/login");
      return false;
    }
    if (viewerRole !== "USER") {
      toast.error("فقط بیماران می‌توانند پزشک را ارزیابی کنند.");
      return false;
    }
    return true;
  };

  const likeDoctor = async () => {
    if (!doctor || !(await requirePatient())) return;
    const previous = doctor;
    setIsLiking(true);
    await mutateDoctor(
      {
        ...doctor,
        is_liked: !doctor.is_liked,
        likes_count: doctor.likes_count + (doctor.is_liked ? -1 : 1),
      },
      false,
    );
    try {
      const result = await toggleDoctorLike(doctor.id);
      await mutateDoctor(
        { ...doctor, is_liked: result.is_liked, likes_count: result.likes_count },
        false,
      );
    } catch {
      await mutateDoctor(previous, false);
      toast.error("ثبت لایک انجام نشد.");
    } finally {
      setIsLiking(false);
    }
  };

  const submitReview = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!(await requirePatient())) return;
    setIsSubmitting(true);
    try {
      const saved = await submitDoctorReview(doctorId, { rating, comment });
      await mutateFirstReviews((current) => current ? {
        ...current,
        results: [saved, ...current.results.filter((review) => review.id !== saved.id)],
      } : current, false);
      await mutateDoctor();
      setRating(5);
      setComment("");
      toast.success("نظر شما با موفقیت ثبت شد");
    } catch {
      toast.error("ثبت نظر انجام نشد.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading || !doctor) {
    return <div className="mx-auto min-h-screen max-w-3xl p-8"><Skeleton className="h-96 rounded-2xl" /></div>;
  }

  return (
    <div className="min-h-screen w-full bg-slate-50 pb-12" dir="rtl">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <button onClick={() => router.back()} className="mb-6 flex items-center gap-1 text-sm font-bold text-slate-600 hover:text-[#2993A3]">
          <ArrowRight className="h-4 w-4" /> بازگشت به لیست
        </button>
        <article className="mb-8 rounded-2xl border border-gray-100 bg-white p-8 text-center shadow-sm">
          <Avatar className="mx-auto mb-4 h-32 w-32 border-4 border-[#5FB4FF]">
            <AvatarImage src={doctor.profile_picture || undefined} />
            <AvatarFallback className="bg-[#E9F5F9] text-[#2993A3]"><Stethoscope className="h-12 w-12" /></AvatarFallback>
          </Avatar>
          <h1 className="mb-2 text-2xl font-bold text-slate-900">دکتر {doctor.first_name} {doctor.last_name}</h1>
          <p className="mb-6 flex items-center justify-center gap-1 text-gray-500"><MapPin className="h-4 w-4" /> {doctor.clinic_name || "مطب خصوصی"}</p>
          <div className="flex items-center justify-center gap-8 border-t border-gray-100 pt-6">
            <div><span className="block text-xs text-gray-500">امتیاز</span><strong className="flex items-center gap-1 text-yellow-600"><Star className="h-4 w-4" fill="currentColor" />{doctor.average_rating.toFixed(1)} از ۵ ({doctor.vote_count} رأی)</strong></div>
            <Button variant="ghost" disabled={isLiking} onClick={() => void likeDoctor()} className={doctor.is_liked ? "text-red-500" : "text-gray-500"}>
              <Heart className="h-4 w-4" fill={doctor.is_liked ? "currentColor" : "none"} /> {doctor.likes_count}
            </Button>
          </div>
        </article>
        <section className="rounded-2xl border border-gray-100 bg-white p-8 shadow-sm">
          <h2 className="mb-4 text-lg font-bold text-slate-800">نظرات کاربران</h2>
          {viewerRole === "USER" ? (
            <form onSubmit={submitReview} className="mb-8 border-b border-gray-100 pb-6">
              <div className="mb-3 flex items-center gap-2">
                <span className="text-sm font-medium">امتیاز شما:</span>
                {[1, 2, 3, 4, 5].map((star) => (
                  <button type="button" key={star} aria-label={`${star} ستاره`} aria-pressed={star === rating} onClick={() => setRating(star)} className={star <= rating ? "text-yellow-500" : "text-gray-300"}>
                    <Star className="h-5 w-5" fill={star <= rating ? "currentColor" : "none"} />
                  </button>
                ))}
              </div>
              <Textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="تجربه خود را با ما به اشتراک بگذارید..." className="mb-3" />
              <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "در حال ارسال..." : "ثبت نظر"}</Button>
            </form>
          ) : <p className="mb-8 rounded-xl bg-cyan-50 p-4 text-sm text-[#2993A3]">برای ثبت امتیاز باید با حساب بیمار وارد شوید.</p>}
          <div className="space-y-4">
            {reviews.length ? reviews.map((review) => (
              <article key={review.id} className="long-list-item rounded-xl bg-slate-50 p-4">
                <div className="mb-1 flex items-center justify-between"><strong className="text-sm">{review.reviewer_display_name}</strong><span className="text-xs text-yellow-600">{review.rating} از ۵</span></div>
                <p className="text-sm text-gray-600">{review.comment}</p>
              </article>
            )) : <p className="py-4 text-center text-sm text-gray-400">هنوز نظری ثبت نشده است.</p>}
            {lastReviewPage?.next && (
              <Button type="button" variant="outline" className="w-full" onClick={async () => {
                const next = await getDoctorReviews(doctorId, reviewPages.length + 1);
                setAdditionalReviewPages((current) => [...current, next]);
              }}>نمایش نظرهای بیشتر</Button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
