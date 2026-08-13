'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getPublicDoctorDetail, toggleDoctorLike, getDoctorReviews, submitDoctorReview } from '@/lib/public-doctors';
import { DoctorDetail, Review, UserRole } from '@/lib/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowRight, Heart, Star, Stethoscope, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { getCurrentUser, restoreSession } from '@/lib/auth';

export default function DoctorDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [doctor, setDoctor] = useState<DoctorDetail | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLiking, setIsLiking] = useState(false);
  
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [reviewPage, setReviewPage] = useState(1);
  const [hasMoreReviews, setHasMoreReviews] = useState(false);
  const [viewerRole, setViewerRole] = useState<UserRole | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const authenticated = await restoreSession();
      if (authenticated) {
        setViewerRole((await getCurrentUser()).role);
      } else {
        setViewerRole(null);
      }
      const [docData, revData] = await Promise.all([
        getPublicDoctorDetail(id as string),
        getDoctorReviews(id as string)
      ]);
      setDoctor(docData);
      setReviews(revData.results);
      setReviewPage(1);
      setHasMoreReviews(Boolean(revData.next));
    } catch (err) {
      console.error(err);
      toast.error("خطا در دریافت اطلاعات پزشک");
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleLike = async () => {
    if (!(await restoreSession()) || viewerRole === null) {
      toast.error("برای لایک کردن ابتدا باید وارد شوید.");
      router.push("/login");
      return;
    }
    if (viewerRole !== 'USER') {
      toast.error("فقط بیماران می‌توانند پزشک را لایک کنند.");
      return;
    }
    if (!doctor) return;

    setIsLiking(true);
    // Optimistic UI
    const prevLiked = doctor.is_liked;
    const prevLikes = doctor.likes_count;
    setDoctor({
      ...doctor,
      is_liked: !prevLiked,
      likes_count: prevLiked ? prevLikes - 1 : prevLikes + 1
    });

    try {
      const res = await toggleDoctorLike(doctor.id);
      setDoctor(prev => prev ? { ...prev, is_liked: res.is_liked, likes_count: res.likes_count } : prev);
    } catch (err) {
      setDoctor(prev => prev ? { ...prev, is_liked: prevLiked, likes_count: prevLikes } : prev);
      toast.error("خطا در ثبت لایک");
    } finally {
      setIsLiking(false);
    }
  };

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!(await restoreSession()) || viewerRole === null) {
      toast.error("برای ثبت نظر ابتدا باید وارد شوید.");
      router.push("/login");
      return;
    }
    if (viewerRole !== 'USER') {
      toast.error("فقط بیماران می‌توانند به پزشک امتیاز دهند.");
      return;
    }

    setIsSubmittingReview(true);
    try {
      const newReview = await submitDoctorReview(id as string, { rating, comment });
      setReviews(prev => [newReview, ...prev.filter((review) => review.id !== newReview.id)]);
      setDoctor(await getPublicDoctorDetail(id as string));
      setComment('');
      setRating(5);
      toast.success("نظر شما با موفقیت ثبت شد");
    } catch (err) {
      toast.error("خطا در ثبت نظر");
    } finally {
      setIsSubmittingReview(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen w-full bg-slate-50 p-4" dir="rtl">
        <div className="max-w-3xl mx-auto bg-white p-8 rounded-2xl border border-gray-100 shadow-sm">
          <Skeleton className="w-24 h-24 rounded-full mx-auto mb-4" />
          <Skeleton className="h-6 w-1/2 mx-auto mb-2" />
          <Skeleton className="h-4 w-1/3 mx-auto mb-8" />
          <Skeleton className="h-10 w-full mb-4" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-slate-50 pb-12" dir="rtl">
      <div className="max-w-3xl mx-auto px-4 py-8">
        
        <button onClick={() => router.back()} className="flex items-center gap-1 text-sm font-bold text-slate-600 hover:text-[#2993A3] mb-6">
          <ArrowRight className="h-4 w-4" /> بازگشت به لیست
        </button>

        {/* Doctor Profile Card */}
        <div className="bg-white p-8 rounded-2xl border border-gray-100 shadow-sm mb-8 text-center">
          <Avatar className="w-32 h-32 mx-auto mb-4 border-4 border-[#5FB4FF]">
            <AvatarImage src={doctor?.profile_picture || undefined} />
            <AvatarFallback className="bg-[#E9F5F9] text-[#2993A3]">
              <Stethoscope className="w-12 h-12" />
            </AvatarFallback>
          </Avatar>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">دکتر {doctor?.first_name} {doctor?.last_name}</h1>
          <p className="text-gray-500 mb-1 flex items-center justify-center gap-1">
            <MapPin className="w-4 h-4" /> {doctor?.clinic_name || "مطب خصوصی"}
          </p>
          <p className="text-sm text-gray-400 mb-6">{doctor?.specialty || "متخصص دندانپزشکی"}</p>

          <div className="flex items-center justify-center gap-6 border-t border-gray-100 pt-6">
            <div className="flex flex-col items-center">
              <span className="text-xs text-gray-500 mb-1">امتیاز</span>
              <div className="flex items-center gap-1 font-bold text-yellow-500">
                <Star className="w-4 h-4" fill="currentColor" />
                {doctor?.average_rating.toFixed(1) || "0.0"} از ۵ ({doctor?.vote_count || 0} رأی)
              </div>
            </div>
            
            <div className="border-r border-gray-100"></div>

            <div className="flex flex-col items-center">
              <span className="text-xs text-gray-500 mb-1">لایک‌ها</span>
              <Button 
                variant="ghost" 
                onClick={handleLike} 
                disabled={isLiking}
                className={`flex items-center gap-1 font-bold ${doctor?.is_liked ? 'text-red-500' : 'text-gray-400'}`}
              >
                <Heart className="w-4 h-4" fill={doctor?.is_liked ? "currentColor" : "none"} />
                {doctor?.likes_count || 0}
              </Button>
            </div>
          </div>
        </div>

        {/* Reviews Section */}
        <div className="bg-white p-8 rounded-2xl border border-gray-100 shadow-sm">
          <h2 className="text-lg font-bold text-slate-800 mb-4">نظرات کاربران</h2>

          {/* Submit Review Form */}
          {viewerRole === 'USER' ? <form onSubmit={handleReviewSubmit} className="mb-8 border-b border-gray-100 pb-6">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm font-medium text-gray-700">امتیاز شما:</span>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    type="button"
                    key={star}
                    aria-label={`${star} ستاره`}
                    aria-pressed={star === rating}
                    onClick={() => setRating(star)}
                    className={`transition-transform hover:scale-110 ${star <= rating ? 'text-yellow-500' : 'text-gray-300'}`}
                  >
                    <Star className="w-5 h-5" fill={star <= rating ? "currentColor" : "none"} />
                  </button>
                ))}
              </div>
            </div>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="تجربه خود را با ما به اشتراک بگذارید..."
              className="mb-3 bg-slate-50 border-gray-200 focus:border-[#5FB4FF]"
            />
            <Button type="submit" disabled={isSubmittingReview} className="bg-[#2993A3] hover:bg-[#1f7b89]">
              {isSubmittingReview ? "در حال ارسال..." : "ثبت نظر"}
            </Button>
          </form> : (
            <div className="mb-8 rounded-xl border border-cyan-100 bg-cyan-50 p-4 text-sm text-[#2993A3]">
              {viewerRole === null ? "برای ثبت امتیاز ابتدا وارد حساب بیمار شوید." : "فقط حساب‌های بیمار امکان ثبت امتیاز دارند."}
            </div>
          )}

          {/* Reviews List */}
          <div className="space-y-4">
            {reviews.length === 0 ? (
              <p className="text-center text-gray-400 py-4 text-sm">هنوز نظری ثبت نشده است. اولین نفر باشید!</p>
            ) : (
              reviews.map((rev) => (
                <div key={rev.id} className="flex gap-3">
                  <Avatar className="w-10 h-10 border border-gray-200 flex-shrink-0">
                    <AvatarFallback className="bg-gray-100 text-gray-500 text-xs">
                      {rev.reviewer_display_name?.[0] || "ک"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 bg-slate-50 rounded-xl p-4">
                    <div className="flex justify-between items-center mb-1">
                      <h4 className="font-bold text-sm text-slate-800">{rev.reviewer_display_name}</h4>
                      <div className="flex items-center gap-1 text-xs text-yellow-500">
                        {Array.from({ length: rev.rating }).map((_, i) => (
                          <Star key={i} className="w-3 h-3" fill="currentColor" />
                        ))}
                      </div>
                    </div>
                    <p className="text-sm text-gray-600 leading-relaxed">{rev.comment}</p>
                  </div>
                </div>
              ))
            )}
            {hasMoreReviews && (
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={async () => {
                  const nextPage = reviewPage + 1;
                  const next = await getDoctorReviews(id as string, nextPage);
                  setReviews((current) => [...current, ...next.results]);
                  setReviewPage(nextPage);
                  setHasMoreReviews(Boolean(next.next));
                }}
              >
                نمایش نظرهای بیشتر
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
