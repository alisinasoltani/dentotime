"use client";

import axios from "axios";
import { format as formatJalali } from "date-fns-jalali";
import {
  Check,
  Clock3,
  Loader2,
  Star,
  ThumbsUp,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import useSWR from "swr";
import { toast } from "sonner";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { restoreSession } from "@/lib/auth";
import {
  getDoctorRatingSummary,
  getDoctorReviewEligibility,
  getDoctorReviews,
  submitDoctorReview,
} from "@/lib/public-doctors";
import type {
  DoctorRatingSummary,
  PaginatedResponse,
  RatingParameter,
  Review,
  ReviewEligibility,
} from "@/lib/types";

const EMPTY_REVIEWS: PaginatedResponse<Review> = {
  count: 0,
  next: null,
  previous: null,
  results: [],
};

const PERSIAN_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];

function toPersianDigits(value: string | number) {
  return String(value).replace(/\d/g, (digit) => PERSIAN_DIGITS[Number(digit)]);
}

function jalaliDate(value: string) {
  return toPersianDigits(formatJalali(new Date(value), "yyyy/MM/dd"));
}

function reviewAnswer(review: Review, key: string) {
  return review.answers?.find((answer) => answer.key === key);
}

export function DoctorRatingSection({
  doctorIdentifier,
  doctorName,
}: {
  doctorIdentifier: string;
  doctorName: string;
}) {
  const router = useRouter();
  const [reviewPages, setReviewPages] = useState<PaginatedResponse<Review>[]>([]);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [eligibility, setEligibility] = useState<ReviewEligibility | null>(null);
  const [isCheckingEligibility, setIsCheckingEligibility] = useState(false);
  const [formStep, setFormStep] = useState<"ratings" | "comment">("ratings");
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [comment, setComment] = useState("");
  const [showValidation, setShowValidation] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    data: summary,
    error: summaryError,
    isLoading: summaryLoading,
    mutate: mutateSummary,
  } = useSWR(
    ["doctor-rating-summary", doctorIdentifier],
    ([, id]) => getDoctorRatingSummary(id),
    { revalidateOnFocus: false },
  );
  const {
    data: firstReviews = EMPTY_REVIEWS,
    error: reviewsError,
    isLoading: reviewsLoading,
    mutate: mutateFirstReviews,
  } = useSWR(
    ["doctor-public-reviews", doctorIdentifier, 1],
    ([, id]) => getDoctorReviews(id),
    { fallbackData: EMPTY_REVIEWS, revalidateOnFocus: false },
  );

  const allReviews = useMemo(
    () => [firstReviews, ...reviewPages].flatMap((page) => page.results),
    [firstReviews, reviewPages],
  );
  const lastReviewPage = reviewPages.at(-1) ?? firstReviews;

  const prepareExistingReview = (
    currentEligibility: ReviewEligibility,
    parameters: RatingParameter[],
  ) => {
    const existing = currentEligibility.existing_review;
    const nextAnswers: Record<number, number> = {};
    for (const parameter of parameters) {
      const existingAnswer = existing?.answers?.find(
        (answer) => answer.parameter_id === parameter.id,
      );
      if (existingAnswer) nextAnswers[parameter.id] = existingAnswer.value;
    }
    setAnswers(nextAnswers);
    setComment(existing?.comment ?? "");
  };

  const openRatingDialog = async () => {
    setEligibility(null);
    setIsCheckingEligibility(true);
    setFormStep("ratings");
    setShowValidation(false);
    try {
      if (!(await restoreSession())) {
        router.push(
          `/login?returnTo=${encodeURIComponent(`/doctors/${doctorIdentifier}#doctor-ratings`)}`,
        );
        return;
      }
      setDialogOpen(true);
      const result = await getDoctorReviewEligibility(doctorIdentifier);
      setEligibility(result);
      if (result.state === "ELIGIBLE" && summary) {
        prepareExistingReview(result, summary.parameters);
      }
    } catch (error) {
      if (axios.isAxiosError(error) && [401, 403].includes(error.response?.status ?? 0)) {
        setDialogOpen(false);
        router.push(
          `/login?returnTo=${encodeURIComponent(`/doctors/${doctorIdentifier}#doctor-ratings`)}`,
        );
      } else {
        toast.error("بررسی امکان ثبت امتیاز انجام نشد. دوباره تلاش کنید.");
        setDialogOpen(false);
      }
    } finally {
      setIsCheckingEligibility(false);
    }
  };

  const setAnswer = (parameterId: number, value: number) => {
    setAnswers((current) => ({ ...current, [parameterId]: value }));
  };

  const continueToComment = () => {
    const parameters = summary?.parameters ?? [];
    if (parameters.some((parameter) => answers[parameter.id] === undefined)) {
      setShowValidation(true);
      return;
    }
    setShowValidation(false);
    setFormStep("comment");
  };

  const submit = async () => {
    if (!summary) return;
    setIsSubmitting(true);
    try {
      const saved = await submitDoctorReview(doctorIdentifier, {
        answers: summary.parameters.map((parameter) => ({
          parameter_id: parameter.id,
          value: answers[parameter.id],
        })),
        comment,
      });
      await Promise.all([
        mutateFirstReviews((current) => ({
          ...(current ?? EMPTY_REVIEWS),
          count: current?.results.some((review) => review.id === saved.id)
            ? current.count
            : (current?.count ?? 0) + 1,
          results: [
            saved,
            ...(current?.results ?? []).filter((review) => review.id !== saved.id),
          ],
        }), false),
        mutateSummary(),
      ]);
      setReviewPages([]);
      setDialogOpen(false);
      toast.success("نظر شما با موفقیت ثبت شد.");
    } catch (error) {
      const parameterChanged = axios.isAxiosError(error) && error.response?.status === 400;
      toast.error(
        parameterChanged
          ? "گزینه‌های امتیازدهی تغییر کرده‌اند؛ صفحه را تازه کنید و دوباره تلاش کنید."
          : "ثبت نظر انجام نشد. دوباره تلاش کنید.",
      );
      if (parameterChanged) void mutateSummary();
    } finally {
      setIsSubmitting(false);
    }
  };

  const loadMore = async () => {
    if (!lastReviewPage.next) return;
    setIsLoadingMore(true);
    try {
      const nextPage = await getDoctorReviews(doctorIdentifier, reviewPages.length + 2);
      setReviewPages((current) => [...current, nextPage]);
    } catch {
      toast.error("دریافت نظرهای بیشتر انجام نشد.");
    } finally {
      setIsLoadingMore(false);
    }
  };

  return (
    <div className="mt-6 flex flex-col gap-4" id="doctor-ratings">
      <RatingSummaryCard
        doctorName={doctorName}
        summary={summary}
        isLoading={summaryLoading}
        hasError={Boolean(summaryError)}
        onRate={() => void openRatingDialog()}
      />

      <section
        aria-labelledby="doctor-comments-title"
        className="rounded-sm border border-border bg-background p-5 sm:p-8"
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 id="doctor-comments-title" className="text-xl font-black text-foreground sm:text-2xl">
              نظر کاربران
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              تجربه مراجعه‌کنندگان تأییدشده به {doctorName}
            </p>
          </div>
          <span className="text-sm font-bold text-primary">
            {toPersianDigits(summary?.vote_count ?? firstReviews.count)} نظر
          </span>
        </div>

        <div className="mt-6 flex flex-col gap-4" aria-busy={reviewsLoading}>
          {reviewsLoading ? (
            <>
              <Skeleton className="h-44 w-full rounded-sm" />
              <Skeleton className="h-40 w-full rounded-sm" />
            </>
          ) : reviewsError ? (
            <p className="rounded-sm border border-border bg-muted p-5 text-center text-sm text-muted-foreground">
              دریافت نظرها در حال حاضر امکان‌پذیر نیست.
            </p>
          ) : allReviews.length === 0 ? (
            <p className="rounded-sm border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              هنوز نظری برای این پزشک ثبت نشده است.
            </p>
          ) : (
            allReviews.map((review) => <ReviewCard key={review.id} review={review} />)
          )}
        </div>

        {lastReviewPage.next ? (
          <Button
            type="button"
            variant="ghost"
            className="mx-auto mt-5 flex text-primary"
            disabled={isLoadingMore}
            onClick={() => void loadMore()}
          >
            {isLoadingMore ? <Loader2 data-icon="inline-start" className="animate-spin" /> : null}
            نمایش بیشتر
          </Button>
        ) : null}
      </section>

      <RatingDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        doctorName={doctorName}
        eligibility={eligibility}
        isChecking={isCheckingEligibility}
        parameters={summary?.parameters ?? []}
        formStep={formStep}
        answers={answers}
        comment={comment}
        showValidation={showValidation}
        isSubmitting={isSubmitting}
        onAnswer={setAnswer}
        onComment={setComment}
        onContinue={continueToComment}
        onBack={() => setFormStep("ratings")}
        onSubmit={() => void submit()}
      />
    </div>
  );
}

function RatingSummaryCard({
  doctorName,
  summary,
  isLoading,
  hasError,
  onRate,
}: {
  doctorName: string;
  summary?: DoctorRatingSummary;
  isLoading: boolean;
  hasError: boolean;
  onRate: () => void;
}) {
  const starParameters = summary?.parameters.filter(
    (parameter) => parameter.input_type === "STAR",
  ) ?? [];

  return (
    <section
      aria-labelledby="doctor-rating-title"
      className="rounded-sm border border-border bg-background p-5 sm:p-8"
    >
      <h2 id="doctor-rating-title" className="text-xl font-black text-foreground sm:text-2xl">
        نظرات درباره {doctorName}
      </h2>
      {isLoading ? (
        <Skeleton className="mt-6 h-[420px] w-full rounded-sm" />
      ) : hasError || !summary ? (
        <p className="mt-6 rounded-sm border border-border bg-muted p-6 text-center text-sm text-muted-foreground">
          اطلاعات امتیاز این پزشک در حال حاضر در دسترس نیست.
        </p>
      ) : (
        <div className="mt-6 rounded-sm bg-muted/70 p-4 sm:p-6">
          <div className="flex flex-wrap items-end justify-center gap-x-4 gap-y-1 text-center">
            <strong className={summary.vote_count > 0 ? "text-5xl font-black text-foreground" : "text-xl font-black text-foreground"}>
              {summary.vote_count > 0
                ? toPersianDigits(summary.average_rating.toFixed(1))
                : "بدون امتیاز"}
            </strong>
            <div className="pb-1 text-right">
              <Stars value={summary.average_rating} />
              <span className="mt-1 block text-sm text-muted-foreground">
                از {toPersianDigits(summary.vote_count)} کاربر
              </span>
            </div>
          </div>

          <div className="mt-7 flex flex-col gap-5">
            {starParameters.map((parameter) => (
              <div key={parameter.id}>
                <div className="mb-2 flex items-center justify-between gap-4 text-sm">
                  <span className="font-medium text-foreground">{parameter.label}</span>
                  <span className="inline-flex shrink-0 items-center gap-1 font-bold text-rating">
                    <Star className="size-4 fill-current" aria-hidden="true" />
                    {parameter.average == null
                      ? "—"
                      : toPersianDigits(parameter.average.toFixed(2))}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-border">
                  <span
                    className="block h-full rounded-full bg-rating"
                    style={{ width: `${((parameter.average ?? 0) / 5) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-7 grid grid-cols-2 gap-4 border-t border-border pt-5">
            <div className="flex items-center gap-3 border-l border-border pl-5">
              <ThumbsUp className="size-6 text-primary" aria-hidden="true" />
              <div>
                <strong className="block text-lg text-foreground">
                  %{toPersianDigits(summary.recommendation_percentage)}
                </strong>
                <span className="text-sm text-muted-foreground">پیشنهاد کاربران</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Clock3 className="size-6 text-primary" aria-hidden="true" />
              <div>
                <strong className="block text-sm text-foreground">
                  {summary.average_wait_time?.label ?? "بدون داده"}
                </strong>
                <span className="text-sm text-muted-foreground">میانگین زمان انتظار</span>
              </div>
            </div>
          </div>
        </div>
      )}
      <Button
        type="button"
        className="mt-5 h-12 w-full text-base font-bold"
        disabled={isLoading || hasError || !summary}
        onClick={onRate}
      >
        ثبت امتیاز
      </Button>
    </section>
  );
}

function Stars({ value }: { value: number }) {
  return (
    <span className="flex items-center gap-0.5" aria-label={`امتیاز ${value.toFixed(1)} از ۵`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={star <= Math.round(value) ? "size-5 fill-rating text-rating" : "size-5 text-border"}
          aria-hidden="true"
        />
      ))}
    </span>
  );
}

function ReviewCard({ review }: { review: Review }) {
  const recommendation = reviewAnswer(review, "recommendation");
  const waitTime = reviewAnswer(review, "wait_time");

  return (
    <article className="rounded-sm border border-border bg-background p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <Avatar className="size-12 shrink-0">
          <AvatarFallback className="bg-accent text-primary">
            <UserRound aria-hidden="true" />
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-baseline gap-2">
              <strong className="text-base text-foreground">{review.reviewer_display_name}</strong>
              <time dateTime={review.created_at} className="text-xs text-muted-foreground">
                ({jalaliDate(review.created_at)})
              </time>
            </div>
            <Stars value={review.rating} />
          </div>

          <div className="mt-3 flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:flex-wrap sm:gap-x-5">
            {recommendation ? (
              <span className="inline-flex items-center gap-1.5 text-primary">
                <ThumbsUp className="size-4" aria-hidden="true" />
                {recommendation.value === 1
                  ? "این پزشک را پیشنهاد می‌کنم"
                  : "این پزشک را پیشنهاد نمی‌کنم"}
              </span>
            ) : null}
            {waitTime ? (
              <span className="inline-flex items-center gap-1.5">
                <Clock3 className="size-4" aria-hidden="true" />
                زمان انتظار: {waitTime.option_label}
              </span>
            ) : null}
          </div>

          {review.comment ? (
            <p className="mt-4 whitespace-pre-wrap text-[15px] leading-8 text-foreground">
              {review.comment}
            </p>
          ) : null}
        </div>
      </div>
    </article>
  );
}

type RatingDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  doctorName: string;
  eligibility: ReviewEligibility | null;
  isChecking: boolean;
  parameters: RatingParameter[];
  formStep: "ratings" | "comment";
  answers: Record<number, number>;
  comment: string;
  showValidation: boolean;
  isSubmitting: boolean;
  onAnswer: (parameterId: number, value: number) => void;
  onComment: (value: string) => void;
  onContinue: () => void;
  onBack: () => void;
  onSubmit: () => void;
};

function RatingDialog({
  open,
  onOpenChange,
  doctorName,
  eligibility,
  isChecking,
  parameters,
  formStep,
  answers,
  comment,
  showValidation,
  isSubmitting,
  onAnswer,
  onComment,
  onContinue,
  onBack,
  onSubmit,
}: RatingDialogProps) {
  const searchHref = `/user/appointments?doctor=${encodeURIComponent(doctorName)}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-black text-foreground">
            ثبت نظر برای {doctorName}
          </DialogTitle>
          <DialogDescription className="text-right leading-7">
            امتیاز شما فقط پس از یک مراجعه تأییدشده ثبت می‌شود.
          </DialogDescription>
        </DialogHeader>

        {isChecking ? (
          <div className="flex min-h-40 items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" aria-hidden="true" />
            در حال بررسی نوبت‌های شما…
          </div>
        ) : null}

        {!isChecking && eligibility?.state === "NO_APPOINTMENT" ? (
          <EligibilityMessage text="شما هنوز نوبت ثبت شده ای برای این پزشک ندارید" />
        ) : null}

        {!isChecking && eligibility?.state === "UPCOMING_APPOINTMENT" ? (
          <EligibilityMessage text="شما هنوز به این پزشک مراجعه نکردید" />
        ) : null}

        {!isChecking && eligibility?.state === "VISIT_CONFIRMATION_REQUIRED" ? (
          <EligibilityMessage text="شما هنوز یک نوبت مراجعه شده با این پزشک ندارید">
            <Link
              href={searchHref}
              className="mt-4 block text-sm font-bold leading-7 text-primary underline underline-offset-4"
            >
              اگر در نوبت دریافت شده، به این پزشک مراجعه کردید، لطفا وضعیت نوبت خود را به &lt;مراجعه کردم&gt; تغییر دهید
            </Link>
          </EligibilityMessage>
        ) : null}

        {!isChecking && eligibility?.state === "ELIGIBLE" && formStep === "ratings" ? (
          <div className="flex flex-col gap-5">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-bold text-primary">مرحله ۱ از ۲</span>
              <span className="text-muted-foreground">به همه موارد پاسخ دهید</span>
            </div>
            <div className="grid grid-cols-2 gap-2" aria-hidden="true">
              <span className="h-1 rounded-full bg-primary" />
              <span className="h-1 rounded-full bg-border" />
            </div>

            <FieldGroup>
              {parameters.map((parameter) => (
                <RatingQuestion
                  key={parameter.id}
                  parameter={parameter}
                  value={answers[parameter.id]}
                  invalid={showValidation && answers[parameter.id] === undefined}
                  onChange={(value) => onAnswer(parameter.id, value)}
                />
              ))}
            </FieldGroup>

            {showValidation ? (
              <FieldError>لطفا به همه پرسش‌های امتیازدهی پاسخ دهید.</FieldError>
            ) : null}
            <Button type="button" className="h-12 text-base font-bold" onClick={onContinue}>
              ثبت نظر و پایان
            </Button>
          </div>
        ) : null}

        {!isChecking && eligibility?.state === "ELIGIBLE" && formStep === "comment" ? (
          <div className="flex flex-col gap-5">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-bold text-primary">مرحله ۲ از ۲</span>
              <button type="button" onClick={onBack} className="min-h-11 px-2 font-bold text-primary">
                بازگشت به امتیازها
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2" aria-hidden="true">
              <span className="h-1 rounded-full bg-primary" />
              <span className="h-1 rounded-full bg-primary" />
            </div>
            <Field>
              <FieldLabel htmlFor="doctor-review-comment">
                نظر خود را در مورد این پزشک بنویسید (اختیاری)
              </FieldLabel>
              <Textarea
                id="doctor-review-comment"
                value={comment}
                maxLength={2000}
                rows={6}
                placeholder="تجربه مراجعه خود را بنویسید…"
                onChange={(event) => onComment(event.target.value)}
              />
              <FieldDescription className="text-right">
                از درج شماره تماس یا اطلاعات پزشکی خصوصی خودداری کنید.
              </FieldDescription>
            </Field>
            <Button
              type="button"
              className="h-12 text-base font-bold"
              disabled={isSubmitting}
              onClick={onSubmit}
            >
              {isSubmitting ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Check data-icon="inline-start" />}
              ثبت نظر
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function EligibilityMessage({
  text,
  children,
}: {
  text: string;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-sm border border-border bg-muted p-5 text-center">
      <p className="font-bold leading-7 text-foreground">{text}</p>
      {children}
    </div>
  );
}

function RatingQuestion({
  parameter,
  value,
  invalid,
  onChange,
}: {
  parameter: RatingParameter;
  value: number | undefined;
  invalid: boolean;
  onChange: (value: number) => void;
}) {
  if (parameter.input_type === "WAIT_TIME") {
    return (
      <Field data-invalid={invalid}>
        <FieldLabel>{parameter.prompt || parameter.label}</FieldLabel>
        <Select
          value={value === undefined ? "" : String(value)}
          onValueChange={(nextValue) => onChange(Number(nextValue))}
        >
          <SelectTrigger className="h-11 w-full" aria-invalid={invalid}>
            <SelectValue placeholder="زمان انتظار را انتخاب کنید" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {parameter.options.map((option) => (
                <SelectItem key={option.value} value={String(option.value)}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
    );
  }

  const values = parameter.input_type === "STAR" ? [1, 2, 3, 4, 5] : [1, 0];
  return (
    <FieldSet data-invalid={invalid}>
      <FieldLegend variant="label">{parameter.prompt || parameter.label}</FieldLegend>
      <ToggleGroup
        type="single"
        value={value === undefined ? "" : String(value)}
        variant="outline"
        className={parameter.input_type === "STAR" ? "grid w-full grid-cols-5" : "grid w-full grid-cols-2"}
        aria-invalid={invalid}
        onValueChange={(nextValue) => {
          if (nextValue !== "") onChange(Number(nextValue));
        }}
      >
        {values.map((optionValue) => (
          <ToggleGroupItem
            key={optionValue}
            value={String(optionValue)}
            aria-label={
              parameter.input_type === "STAR"
                ? `${optionValue} ستاره برای ${parameter.label}`
                : optionValue === 1
                  ? "بله"
                  : "خیر"
            }
          >
            {parameter.input_type === "STAR" ? (
              <span className="inline-flex items-center gap-1">
                <Star className={value !== undefined && optionValue <= value ? "fill-rating text-rating" : "text-muted-foreground"} />
                {toPersianDigits(optionValue)}
              </span>
            ) : optionValue === 1 ? "بله" : "خیر"}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </FieldSet>
  );
}
