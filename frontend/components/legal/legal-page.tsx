import Link from "next/link";
import { ArrowRight, CheckCircle2, ShieldCheck } from "lucide-react";
import Footer from "@/components/Footer";

type LegalSection = {
  title: string;
  body: string;
  bullets?: string[];
};

export default function LegalPage({
  eyebrow,
  title,
  description,
  updatedAt = "۱۴۰۵/۰۶/۰۵",
  sections,
}: {
  eyebrow: string;
  title: string;
  description: string;
  updatedAt?: string;
  sections: LegalSection[];
}) {
  return (
    <>
      <main dir="rtl" className="bg-[#F8FCFD] pb-20">
      <section className="border-b border-[#DCEFF1] bg-white">
        <div className="mx-auto max-w-[1040px] px-4 py-14 sm:px-6 lg:py-20">
          <Link href="/" className="mb-8 inline-flex items-center gap-2 text-sm font-bold text-[#2993A3] hover:text-[#227D8A]">
            <ArrowRight className="size-4" aria-hidden="true" /> بازگشت به صفحه اصلی
          </Link>
          <p className="text-sm font-black text-[#2993A3]">{eyebrow}</p>
          <h1 className="mt-3 max-w-3xl text-3xl font-black leading-tight text-[#172B2F] sm:text-5xl">{title}</h1>
          <p className="mt-5 max-w-3xl text-base leading-8 text-[#5B7074]">{description}</p>
          <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#E9F7F8] px-4 py-2 text-xs font-bold text-[#247F8D]">
            <ShieldCheck className="size-4" aria-hidden="true" /> آخرین به‌روزرسانی: {updatedAt}
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-[1040px] gap-5 px-4 pt-8 sm:px-6 lg:grid-cols-[0.72fr_1.28fr] lg:pt-12">
        <aside className="h-fit rounded-2xl border border-[#D9EFF1] bg-white p-5 shadow-[0_16px_50px_rgba(37,129,143,0.08)] lg:sticky lg:top-28">
          <p className="text-sm font-black text-[#172B2F]">دسترسی سریع</p>
          <nav className="mt-4 grid gap-2" aria-label="فهرست بخش‌های صفحه">
            {sections.map((section, index) => (
              <a key={section.title} href={`#section-${index + 1}`} className="rounded-xl px-3 py-2.5 text-sm font-bold text-[#5B7074] transition hover:bg-[#EFFAFB] hover:text-[#2993A3]">
                {section.title}
              </a>
            ))}
          </nav>
          <div className="mt-5 rounded-xl bg-[#F4FBFC] p-4 text-xs leading-6 text-[#5B7074]">
            برای پرسش درباره نوبت یا خدمات، از صفحه <Link className="font-bold text-[#2993A3]" href="/contact">تماس با ما</Link> با پشتیبانی در ارتباط باشید.
          </div>
        </aside>

        <div className="grid gap-4">
          {sections.map((section, index) => (
            <section key={section.title} id={`section-${index + 1}`} className="scroll-mt-28 rounded-2xl border border-[#D9EFF1] bg-white p-5 shadow-[0_16px_50px_rgba(37,129,143,0.06)] sm:p-7">
              <h2 className="flex items-center gap-2 text-lg font-black text-[#172B2F] sm:text-xl">
                <CheckCircle2 className="size-5 shrink-0 text-[#2993A3]" aria-hidden="true" /> {section.title}
              </h2>
              <p className="mt-4 text-sm leading-8 text-[#53676B]">{section.body}</p>
              {section.bullets?.length ? (
                <ul className="mt-4 grid gap-2 text-sm leading-7 text-[#53676B]">
                  {section.bullets.map((bullet) => <li key={bullet} className="flex gap-2"><span className="mt-3 size-1.5 shrink-0 rounded-full bg-[#75C1C7]" aria-hidden="true" />{bullet}</li>)}
                </ul>
              ) : null}
            </section>
          ))}
        </div>
      </div>
      </main>
      <Footer />
    </>
  );
}
