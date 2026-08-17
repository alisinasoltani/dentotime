import Image from "next/image";
import { Clock3, Microscope, Settings2, ShieldCheck } from "lucide-react";

const featureItems = [
  {
    icon: Clock3,
    title: "تحویل سریع و به‌موقع",
    text: "جریان کاری دیجیتال و پیوسته، زمان انتظار را کم می‌کند و وضعیت هر سفارش را قابل پیگیری نگه می‌دارد.",
  },
  {
    icon: Settings2,
    title: "متریال استاندارد و زیست‌سازگار",
    text: "مواد اولیه و بلوک‌های سرامیکی بر اساس کاربرد بالینی و دوام مورد انتظار انتخاب می‌شوند.",
  },
  {
    icon: ShieldCheck,
    title: "کنترل کیفیت چندمرحله‌ای",
    text: "تطابق، آناتومی و کیفیت سطح پیش از تحویل نهایی در چند ایستگاه مستقل بررسی می‌شود.",
  },
];

export default function FeaturesSection() {
  return (
    <section id="features" className="scroll-mt-28 py-16 sm:py-20 lg:py-28" dir="rtl">
      <div className="mx-auto max-w-[1080px] px-4 sm:px-6">
        <div className="grid items-center gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
          <div>
            <h2 className="text-[28px] font-black leading-[1.5] text-[#111] sm:text-[42px] sm:leading-[1.35]">چه چیزی ما را متفاوت کرده؟</h2>
            <p className="mt-5 text-[15px] leading-8 text-[#555] sm:text-base">
              تفاوت دنتوتایم در ترکیب تصمیم‌گیری شفاف برای بیمار، همکاری نزدیک پزشک و لابراتوار و کنترل کیفی قابل پیگیری است. نتیجه باید هم از نظر بالینی قابل اعتماد باشد و هم برای بیمار قابل فهم.
            </p>
            <div className="mt-8 flex items-center gap-4 border-t border-[#DCEBED] pt-6">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-[#E1FCFC] text-[#2993A3]">
                <Microscope className="size-6" aria-hidden="true" />
              </span>
              <p className="text-sm leading-7 text-[#555]">هر مرحله یک مسئول مشخص، معیار کنترل و نتیجه قابل ثبت دارد.</p>
            </div>
          </div>
          <div className="relative aspect-[4/3] overflow-hidden rounded-[24px] bg-[#EFF9FB] shadow-[0_22px_60px_rgba(50,139,154,0.14)]">
            <Image src="/images/features_image_2.png" alt="تکنسین دندان‌سازی در حال بررسی پروتز" fill sizes="(min-width: 1024px) 55vw, 100vw" className="object-cover" />
          </div>
        </div>

        <div className="mt-12 grid overflow-hidden rounded-[24px] border border-[#CAE7EB] bg-[linear-gradient(135deg,#F4FCFC_0%,#E1F4F7_100%)] lg:mt-24 lg:grid-cols-[1.08fr_0.92fr]">
          <div className="relative min-h-[300px] lg:min-h-[520px]">
            <Image src="/images/features_image_3.png" alt="فرآیند دیجیتال ساخت پروتز دندانی" fill sizes="(min-width: 1024px) 55vw, 100vw" className="object-cover" />
          </div>
          <div className="flex flex-col justify-center gap-7 p-6 sm:p-10 lg:p-12">
            <h3 className="text-2xl font-black leading-9 text-[#222] sm:text-3xl">از ثبت اسکن تا تحویل، یک مسیر قابل اعتماد</h3>
            {featureItems.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="flex items-start gap-4">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-white text-[#2993A3] shadow-[0_8px_24px_rgba(50,139,154,0.1)]">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <div>
                    <h4 className="font-extrabold text-[#222]">{item.title}</h4>
                    <p className="mt-1 text-sm leading-7 text-[#5F6C6E]">{item.text}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-12 grid items-center gap-8 lg:mt-24 lg:grid-cols-2 lg:gap-14">
          <div className="relative aspect-[4/3] overflow-hidden rounded-[24px] bg-[#EFF9FB]">
            <Image src="/images/features_image_1.png" alt="کنترل کیفیت پروتز دندانی" fill sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover" />
          </div>
          <div>
            <ShieldCheck className="size-11 text-[#2993A3]" aria-hidden="true" />
            <h3 className="mt-5 text-2xl font-black text-[#222] sm:text-3xl">تضمین کیفیت عملکرد</h3>
            <p className="mt-4 text-[15px] leading-8 text-[#555] sm:text-base">
              خروجی نهایی تنها زمانی تأیید می‌شود که معیارهای تطابق، پایداری ساختار و آناتومی مورد انتظار را عبور کرده باشد. در صورت نیاز، اصلاح پیش از تحویل انجام می‌شود نه پس از تجربه ناخوشایند بیمار.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
