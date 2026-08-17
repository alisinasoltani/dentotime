"use client";

import Image from "next/image";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowRight,
  CalendarDays,
  Check,
  Clock3,
  CreditCard,
  LockKeyhole,
  MapPin,
  ShieldCheck,
  Smartphone,
  Star,
} from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { dentists, insurers, services } from "@/lib/site-data";
import { cn } from "@/lib/utils";

type ModalMode = "closed" | "login" | "signup" | "booking" | "success";
type AuthIntent = "login" | "booking";

type BookingDraft = {
  service: string;
  insurance: string;
  dentistId: string;
  date: string;
  time: string;
};

type BookingExperienceContextValue = {
  openBooking: (serviceSlug?: string, insurance?: string) => void;
  openLogin: () => void;
  isAuthenticated: boolean;
};

const BookingExperienceContext = createContext<BookingExperienceContextValue | null>(null);

const emptyBooking: BookingDraft = {
  service: "",
  insurance: "",
  dentistId: "",
  date: "",
  time: "",
};

const dates = [
  { value: "1405-05-28", day: "سه‌شنبه", date: "۲۸ مرداد" },
  { value: "1405-05-29", day: "چهارشنبه", date: "۲۹ مرداد" },
  { value: "1405-05-30", day: "پنج‌شنبه", date: "۳۰ مرداد" },
  { value: "1405-06-01", day: "شنبه", date: "۱ شهریور" },
];

const times = ["۰۹:۰۰", "۱۰:۳۰", "۱۱:۰۰", "۱۴:۰۰", "۱۵:۳۰", "۱۷:۰۰"];

const steps = [
  { id: 1, label: "خدمت و بیمه" },
  { id: 2, label: "پزشک" },
  { id: 3, label: "تاریخ و ساعت" },
  { id: 4, label: "تأیید و پرداخت" },
];

export function BookingExperienceProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ModalMode>("closed");
  const [authIntent, setAuthIntent] = useState<AuthIntent>("login");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [signupStep, setSignupStep] = useState(1);
  const [bookingStep, setBookingStep] = useState(1);
  const [draft, setDraft] = useState<BookingDraft>(emptyBooking);

  const openBooking = useCallback(
    (serviceSlug?: string, insurance?: string) => {
      setDraft((current) => ({
        ...current,
        service: serviceSlug ?? current.service,
        insurance:
          insurance ?? (serviceSlug && serviceSlug !== current.service ? "" : current.insurance),
        dentistId:
          serviceSlug && insurance
            ? ""
            : serviceSlug && serviceSlug !== current.service
              ? ""
              : current.dentistId,
        date: serviceSlug && insurance ? "" : current.date,
        time: serviceSlug && insurance ? "" : current.time,
      }));
      setBookingStep(serviceSlug && insurance ? 2 : 1);
      if (isAuthenticated) {
        setMode("booking");
      } else {
        setAuthIntent("booking");
        setMode("login");
      }
    },
    [isAuthenticated],
  );

  const openLogin = useCallback(() => {
    setAuthIntent("login");
    setMode("login");
  }, []);

  const finishAuthentication = () => {
    setIsAuthenticated(true);
    if (authIntent === "booking") {
      setMode("booking");
    } else {
      setMode("closed");
      toast.success("با موفقیت وارد حساب کاربری شدید.");
    }
  };

  const eligibleDentists = useMemo(
    () =>
      dentists.filter((dentist) => {
        const hasService = !draft.service || dentist.serviceSlugs.includes(draft.service);
        const hasInsurance =
          !draft.insurance ||
          draft.insurance === "آزاد" ||
          dentist.insurances.includes(draft.insurance);
        return hasService && hasInsurance;
      }),
    [draft.insurance, draft.service],
  );

  const closeModal = () => {
    setMode("closed");
    setSignupStep(1);
  };

  const contextValue = useMemo(
    () => ({ openBooking, openLogin, isAuthenticated }),
    [isAuthenticated, openBooking, openLogin],
  );

  return (
    <BookingExperienceContext.Provider value={contextValue}>
      {children}
      <Dialog open={mode !== "closed"} onOpenChange={(open) => !open && closeModal()}>
        <DialogContent
          dir="rtl"
          className={cn(
            "max-h-[calc(100dvh-24px)] overflow-y-auto rounded-[24px] border border-[#CDEAF0] bg-white p-5 shadow-[0_28px_90px_rgba(34,118,132,0.22)] sm:p-6",
            mode === "booking" ? "sm:max-w-[760px]" : "sm:max-w-[460px]",
          )}
        >
          {mode === "login" && (
            <LoginPanel
              onSubmit={finishAuthentication}
              onSignup={() => {
                setSignupStep(1);
                setMode("signup");
              }}
            />
          )}

          {mode === "signup" && (
            <SignupPanel
              step={signupStep}
              onBack={() =>
                signupStep === 1 ? setMode("login") : setSignupStep((current) => current - 1)
              }
              onContinue={() =>
                signupStep === 3 ? finishAuthentication() : setSignupStep((current) => current + 1)
              }
            />
          )}

          {mode === "booking" && (
            <BookingPanel
              step={bookingStep}
              draft={draft}
              eligibleDentists={eligibleDentists}
              onBack={() => {
                if (bookingStep === 1) {
                  closeModal();
                } else {
                  setBookingStep((current) => current - 1);
                }
              }}
              onService={(service) =>
                setDraft({ ...emptyBooking, service })
              }
              onInsurance={(insurance) => {
                setDraft((current) => ({ ...current, insurance, dentistId: "", date: "", time: "" }));
                setBookingStep(2);
              }}
              onContinue={() => setBookingStep(2)}
              onDentist={(dentistId) => {
                setDraft((current) => ({ ...current, dentistId }));
                setBookingStep(3);
              }}
              onDate={(date) => setDraft((current) => ({ ...current, date, time: "" }))}
              onTime={(time) => {
                setDraft((current) => ({ ...current, time }));
                setBookingStep(4);
              }}
              onPay={() => setMode("success")}
            />
          )}

          {mode === "success" && (
            <div className="flex flex-col items-center gap-4 px-2 py-8 text-center">
              <span className="flex size-16 items-center justify-center rounded-full bg-[#E1FCFC] text-[#2993A3]">
                <Check className="size-8" aria-hidden="true" />
              </span>
              <DialogHeader className="items-center">
                <DialogTitle className="text-2xl font-extrabold text-[#111]">
                  نوبت شما ثبت شد
                </DialogTitle>
                <DialogDescription className="max-w-sm text-center leading-7 text-[#666]">
                  جزئیات نوبت برای شماره همراه شما ارسال شد. در صورت تغییر برنامه، از بخش نوبت‌های من اقدام کنید.
                </DialogDescription>
              </DialogHeader>
              <Button className="mt-2 h-12 rounded-full px-8" onClick={closeModal}>
                بازگشت به سایت
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </BookingExperienceContext.Provider>
  );
}

export function useBookingExperience() {
  const value = useContext(BookingExperienceContext);
  if (!value) {
    throw new Error("useBookingExperience must be used inside BookingExperienceProvider");
  }
  return value;
}

export function BookingButton({
  serviceSlug,
  children = "رزرو نوبت",
  className,
}: {
  serviceSlug?: string;
  children?: ReactNode;
  className?: string;
}) {
  const { openBooking } = useBookingExperience();
  return (
    <Button
      type="button"
      onClick={() => openBooking(serviceSlug)}
      className={cn("h-11 rounded-full px-6", className)}
    >
      <CalendarDays data-icon="inline-start" aria-hidden="true" />
      {children}
    </Button>
  );
}

function LoginPanel({ onSubmit, onSignup }: { onSubmit: () => void; onSignup: () => void }) {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5 pt-4">
      <DialogHeader>
        <DialogTitle className="text-2xl font-extrabold text-[#111]">ورود به دنتوتایم</DialogTitle>
        <DialogDescription className="leading-6 text-[#666]">
          برای حفظ نوبت و دریافت یادآوری، وارد حساب کاربری خود شوید.
        </DialogDescription>
      </DialogHeader>
      <FieldGroup className="gap-4">
        <Field>
          <FieldLabel htmlFor="login-phone">شماره تلفن همراه</FieldLabel>
          <div className="relative">
            <Smartphone className="pointer-events-none absolute right-4 top-1/2 size-5 -translate-y-1/2 text-[#75A4AB]" />
            <Input
              id="login-phone"
              dir="ltr"
              inputMode="tel"
              autoComplete="tel"
              defaultValue="09121234567"
              className="h-12 rounded-2xl border-[#CFE5E8] pr-11 text-left focus-visible:border-[#2993A3]"
              required
            />
          </div>
        </Field>
        <Field>
          <FieldLabel htmlFor="login-password">رمز عبور</FieldLabel>
          <div className="relative">
            <LockKeyhole className="pointer-events-none absolute right-4 top-1/2 size-5 -translate-y-1/2 text-[#75A4AB]" />
            <Input
              id="login-password"
              type="password"
              autoComplete="current-password"
              defaultValue="dento1234"
              className="h-12 rounded-2xl border-[#CFE5E8] pr-11 focus-visible:border-[#2993A3]"
              required
            />
          </div>
        </Field>
      </FieldGroup>
      <Button type="submit" className="h-12 rounded-full text-base font-bold">
        ورود و ادامه رزرو
      </Button>
      <div className="flex flex-col items-center gap-2 text-sm">
        <button type="button" onClick={onSignup} className="font-bold text-[#2993A3] hover:underline">
          حساب کاربری ندارید؟ ثبت نام کنید
        </button>
        <button type="button" className="text-[#666] hover:text-[#2993A3] hover:underline">
          رمز عبور خود را فراموش کرده‌ام
        </button>
      </div>
    </form>
  );
}

function SignupPanel({
  step,
  onBack,
  onContinue,
}: {
  step: number;
  onBack: () => void;
  onContinue: () => void;
}) {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onContinue();
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5 pt-4">
      <DialogHeader>
        <div className="mb-1 flex items-center justify-between pl-9">
          <DialogTitle className="text-2xl font-extrabold text-[#111]">ساخت حساب کاربری</DialogTitle>
          <span className="text-sm font-bold text-[#2993A3]">مرحله {step} از ۳</span>
        </div>
        <DialogDescription className="leading-6 text-[#666]">
          {step === 1 && "شماره همراهی را وارد کنید که همیشه به آن دسترسی دارید."}
          {step === 2 && "کد تأیید ۵ رقمی ارسال‌شده را وارد کنید."}
          {step === 3 && "اطلاعات هویتی برای ثبت ایمن نوبت ضروری است."}
        </DialogDescription>
      </DialogHeader>

      <div className="grid grid-cols-3 gap-2" aria-hidden="true">
        {[1, 2, 3].map((item) => (
          <span
            key={item}
            className={cn("h-1 rounded-full", item <= step ? "bg-[#2993A3]" : "bg-[#DCECEF]")}
          />
        ))}
      </div>

      <FieldGroup className="gap-4">
        {step === 1 && (
          <Field>
            <FieldLabel htmlFor="signup-phone">شماره تلفن همراه</FieldLabel>
            <Input
              id="signup-phone"
              dir="ltr"
              inputMode="tel"
              placeholder="0912 123 4567"
              className="h-12 rounded-2xl border-[#CFE5E8] text-left"
              required
            />
            <FieldDescription className="text-right">کد تأیید از طریق پیامک ارسال می‌شود.</FieldDescription>
          </Field>
        )}
        {step === 2 && (
          <Field>
            <FieldLabel htmlFor="signup-otp">کد تأیید ۵ رقمی</FieldLabel>
            <Input
              id="signup-otp"
              dir="ltr"
              inputMode="numeric"
              maxLength={5}
              placeholder="• • • • •"
              className="h-14 rounded-2xl border-[#CFE5E8] text-center text-xl tracking-[0.5em]"
              required
            />
            <FieldDescription className="text-right">ارسال مجدد کد تا ۰۰:۴۸ دیگر</FieldDescription>
          </Field>
        )}
        {step === 3 && (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="signup-name">نام</FieldLabel>
                <Input id="signup-name" className="h-12 rounded-2xl border-[#CFE5E8]" required />
              </Field>
              <Field>
                <FieldLabel htmlFor="signup-family">نام خانوادگی</FieldLabel>
                <Input id="signup-family" className="h-12 rounded-2xl border-[#CFE5E8]" required />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="signup-national-id">کد ملی</FieldLabel>
              <Input
                id="signup-national-id"
                dir="ltr"
                inputMode="numeric"
                maxLength={10}
                className="h-12 rounded-2xl border-[#CFE5E8] text-left"
                required
              />
            </Field>
          </>
        )}
      </FieldGroup>

      <Button type="submit" className="h-12 rounded-full text-base font-bold">
        {step === 3 ? "ثبت نام و ادامه رزرو" : "ادامه"}
      </Button>
      <button
        type="button"
        onClick={onBack}
        className="inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-full px-3 text-sm font-bold text-[#555] hover:bg-[#F0FAFC] hover:text-[#2993A3]"
      >
        <ArrowRight className="size-4" aria-hidden="true" />
        بازگشت
      </button>
    </form>
  );
}

function BookingPanel({
  step,
  draft,
  eligibleDentists,
  onBack,
  onService,
  onInsurance,
  onContinue,
  onDentist,
  onDate,
  onTime,
  onPay,
}: {
  step: number;
  draft: BookingDraft;
  eligibleDentists: typeof dentists;
  onBack: () => void;
  onService: (value: string) => void;
  onInsurance: (value: string) => void;
  onContinue: () => void;
  onDentist: (value: string) => void;
  onDate: (value: string) => void;
  onTime: (value: string) => void;
  onPay: () => void;
}) {
  const selectedService = services.find((service) => service.slug === draft.service);
  const selectedDentist = dentists.find((dentist) => dentist.id === draft.dentistId);
  const selectedDate = dates.find((date) => date.value === draft.date);

  return (
    <div className="flex flex-col gap-5 pt-3">
      <DialogHeader>
        <DialogTitle className="text-2xl font-extrabold text-[#111]">رزرو نوبت آنلاین</DialogTitle>
        <DialogDescription className="leading-6 text-[#666]">
          انتخاب شما در هر مرحله ذخیره می‌شود و می‌توانید بدون خروج از این پنجره بازگردید.
        </DialogDescription>
      </DialogHeader>

      <ol className="grid grid-cols-4 gap-1" aria-label="مراحل رزرو نوبت">
        {steps.map((item) => (
          <li key={item.id} className="flex min-w-0 flex-col items-center gap-1 text-center">
            <span
              className={cn(
                "flex size-8 items-center justify-center rounded-full border text-xs font-extrabold",
                item.id < step && "border-[#A8D9DF] bg-[#E1FCFC] text-[#2993A3]",
                item.id === step && "border-[#2993A3] bg-[#2993A3] text-white",
                item.id > step && "border-[#D9E8EA] bg-white text-[#8A989A]",
              )}
            >
              {item.id < step ? <Check className="size-4" aria-hidden="true" /> : item.id}
            </span>
            <span className={cn("truncate text-[11px] sm:text-xs", item.id === step ? "font-bold text-[#2993A3]" : "text-[#777]")}>{item.label}</span>
          </li>
        ))}
      </ol>

      {step === 1 && (
        <div className="flex flex-col gap-3">
          <FieldGroup className="gap-4 rounded-[20px] border border-[#D7EDF0] bg-[#F8FDFD] p-4">
            <Field>
              <FieldLabel>نوع خدمت</FieldLabel>
              <Select value={draft.service} onValueChange={onService}>
                <SelectTrigger className="h-12 w-full rounded-2xl border-[#BFDDE2] bg-white px-4 text-right">
                  <SelectValue placeholder="خدمت مورد نظر را انتخاب کنید" />
                </SelectTrigger>
                <SelectContent position="popper" align="start">
                  <SelectGroup>
                    {services.map((service) => (
                      <SelectItem key={service.slug} value={service.slug}>
                        {service.title}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field data-disabled={!draft.service}>
              <FieldLabel>نوع بیمه تحت پوشش</FieldLabel>
              <Select value={draft.insurance} onValueChange={onInsurance} disabled={!draft.service}>
                <SelectTrigger className="h-12 w-full rounded-2xl border-[#BFDDE2] bg-white px-4 text-right">
                  <SelectValue placeholder={draft.service ? "بیمه را انتخاب کنید" : "ابتدا نوع خدمت را انتخاب کنید"} />
                </SelectTrigger>
                <SelectContent position="popper" align="start">
                  <SelectGroup>
                    {insurers.map((insurer) => (
                      <SelectItem key={insurer} value={insurer}>
                        {insurer}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldDescription className="text-right">
                گزینه «آزاد» همه پزشکان ارائه‌دهنده این خدمت را نمایش می‌دهد.
              </FieldDescription>
            </Field>
          </FieldGroup>
          <div className="flex justify-end">
            <Button
              type="button"
              disabled={!draft.service || !draft.insurance}
              onClick={onContinue}
              className="h-11 min-w-28 rounded-full px-6 font-bold"
            >
              ادامه
            </Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-extrabold text-[#222]">انتخاب پزشک یا مرکز درمانی</h3>
              <p className="mt-1 text-sm text-[#777]">نتایج منطبق با خدمت و پوشش انتخابی شما</p>
            </div>
            <span className="shrink-0 rounded-full bg-[#E8F7F8] px-3 py-1 text-xs font-bold text-[#2993A3]">
              {eligibleDentists.length} نتیجه
            </span>
          </div>
          <div className="flex max-h-[360px] flex-col gap-2 overflow-y-auto pl-1">
            {eligibleDentists.map((dentist) => (
              <button
                type="button"
                key={dentist.id}
                onClick={() => onDentist(dentist.id)}
                className="group flex min-h-[76px] w-full items-center gap-3 rounded-2xl border border-[#D8E9EC] bg-white p-3 text-right transition hover:border-[#75C1C7] hover:bg-[#F8FDFD] focus-visible:outline-3 focus-visible:outline-[#75C1C7]/40"
              >
                <Image src={dentist.image} alt="" width={48} height={48} className="size-12 shrink-0 rounded-xl bg-[#EAF6F7] object-cover" />
                <span className="min-w-0 flex-1">
                  <strong className="block truncate text-sm text-[#222]">دکتر {dentist.firstName} {dentist.lastName}</strong>
                  <span className="mt-0.5 block truncate text-xs text-[#555]">{dentist.specialty}</span>
                  <span className="mt-1 flex items-center gap-1 truncate text-[11px] text-[#777]">
                    <MapPin className="size-3 shrink-0 text-[#2993A3]" aria-hidden="true" />
                    {dentist.address}
                  </span>
                </span>
              </button>
            ))}
            {eligibleDentists.length === 0 && (
              <div className="rounded-2xl border border-dashed border-[#BFDDE2] p-6 text-center text-sm text-[#666]">
                نتیجه‌ای با این پوشش پیدا نشد. به مرحله قبل بازگردید و «آزاد» را انتخاب کنید.
              </div>
            )}
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          {selectedDentist && (
            <div className="flex items-center gap-3 rounded-[20px] border border-[#D7EDF0] bg-[#F8FDFD] p-4 lg:flex-col lg:items-start">
              <Image src={selectedDentist.image} alt="" width={80} height={80} className="size-14 rounded-2xl object-cover lg:size-20" />
              <div>
                <strong className="text-[#222]">دکتر {selectedDentist.firstName} {selectedDentist.lastName}</strong>
                <p className="mt-1 text-xs text-[#666]">{selectedDentist.specialty}</p>
                <span className="mt-2 inline-flex items-center gap-1 text-xs text-[#6B6B6B]">
                  <Star className="size-3.5 fill-[#F7B731] text-[#F7B731]" /> {selectedDentist.rating} ({selectedDentist.reviews} نظر)
                </span>
              </div>
            </div>
          )}
          <div className="flex flex-col gap-4">
            <div>
              <h3 className="mb-2 flex items-center gap-2 text-sm font-extrabold text-[#222]">
                <CalendarDays className="size-4 text-[#2993A3]" /> انتخاب تاریخ
              </h3>
              <div className="grid grid-cols-4 gap-2">
                {dates.map((date) => (
                  <button
                    key={date.value}
                    type="button"
                    onClick={() => onDate(date.value)}
                    className={cn(
                      "min-h-[62px] rounded-xl border px-2 text-xs transition",
                      draft.date === date.value
                        ? "border-[#2993A3] bg-[#2993A3] font-bold text-white"
                        : "border-[#D8E9EC] bg-white text-[#555] hover:border-[#75C1C7]",
                    )}
                  >
                    <span className="block">{date.day}</span>
                    <span className="mt-1 block">{date.date}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <h3 className="mb-2 flex items-center gap-2 text-sm font-extrabold text-[#222]">
                <Clock3 className="size-4 text-[#2993A3]" /> انتخاب ساعت
              </h3>
              <div className="grid grid-cols-3 gap-2">
                {times.map((time) => (
                  <button
                    key={time}
                    type="button"
                    disabled={!draft.date}
                    onClick={() => onTime(time)}
                    className={cn(
                      "min-h-11 rounded-xl border text-sm transition disabled:cursor-not-allowed disabled:opacity-40",
                      draft.time === time
                        ? "border-[#2993A3] bg-[#2993A3] font-bold text-white"
                        : "border-[#D8E9EC] bg-white text-[#555] hover:border-[#75C1C7]",
                    )}
                  >
                    {time}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {step === 4 && selectedDentist && (
        <div className="grid gap-4 lg:grid-cols-[1fr_0.8fr]">
          <div className="rounded-[20px] border border-[#D7EDF0] bg-[#F8FDFD] p-4">
            <h3 className="mb-4 flex items-center gap-2 font-extrabold text-[#222]">
              <ShieldCheck className="size-5 text-[#2993A3]" /> خلاصه نوبت
            </h3>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 text-sm">
              <dt className="text-[#777]">خدمت</dt><dd className="font-bold text-[#333]">{selectedService?.title}</dd>
              <dt className="text-[#777]">بیمه</dt><dd className="font-bold text-[#333]">{draft.insurance}</dd>
              <dt className="text-[#777]">پزشک</dt><dd className="font-bold text-[#333]">دکتر {selectedDentist.firstName} {selectedDentist.lastName}</dd>
              <dt className="text-[#777]">زمان</dt><dd className="font-bold text-[#333]">{selectedDate?.day} {selectedDate?.date}، ساعت {draft.time}</dd>
            </dl>
          </div>
          <div className="flex flex-col gap-4 rounded-[20px] border border-[#9BD8E4] bg-white p-4">
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-[#666]">مبلغ نهایی</span>
              <strong className="text-xl text-[#111]">۲٬۱۵۰٬۰۰۰ <small className="text-xs font-medium">تومان</small></strong>
            </div>
            <Field>
              <FieldLabel htmlFor="discount-code">کد تخفیف</FieldLabel>
              <div className="flex gap-2">
                <Input id="discount-code" className="h-11 rounded-xl border-[#CFE5E8]" placeholder="کد را وارد کنید" />
                <Button type="button" variant="outline" className="h-11 rounded-xl px-4">اعمال</Button>
              </div>
            </Field>
            <Button onClick={onPay} className="mt-auto h-12 rounded-full font-bold">
              <CreditCard data-icon="inline-start" /> پرداخت و رزرو نوبت
            </Button>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={onBack}
        className="inline-flex min-h-11 items-center gap-2 self-start rounded-full px-3 text-sm font-bold text-[#555] hover:bg-[#F0FAFC] hover:text-[#2993A3]"
      >
        <ArrowRight className="size-4" aria-hidden="true" />
        بازگشت
      </button>
    </div>
  );
}
