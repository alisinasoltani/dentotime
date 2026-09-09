import Image from "next/image";
import { ArrowLeft } from "lucide-react";

const technologies = [
  {
    badge: "طراحی دیجیتال",
    title: "سیستم‌های پیشرفته CAD/CAM",
    description: "طراحی و ساخت دیجیتال به لابراتوار اجازه می‌دهد روکش‌ها، اباتمنت‌های اختصاصی و پروتزهای سرامیکی را با تطابق دقیق و در زمان کوتاه‌تری تولید کند.",
    image: "/images/pioneering_technologies_image_2.png",
  },
  {
    badge: "اسکن سه‌بعدی",
    title: "اسکن دیجیتال دندان‌پزشکی",
    description: "فایل اسکن داخل‌دهانی، آناتومی دهان را بدون قالب‌گیری ناخوشایند به محیط طراحی منتقل می‌کند و ارتباط میان پزشک و لابراتوار را شفاف‌تر می‌سازد.",
    image: "/images/pioneering_technologies_image_1.png",
  },
  {
    badge: "ساخت افزایشی",
    title: "چاپ سه‌بعدی و جریان کاری یکپارچه",
    description: "هماهنگی نرم‌افزار طراحی، چاپ سه‌بعدی و کنترل کیفی چندمرحله‌ای، خطای انسانی را کاهش می‌دهد و امکان تکرارپذیری نتیجه را فراهم می‌کند.",
    image: "/images/pioneering_technologies_image_3.png",
  },
];

export default function PioneeringTechnologies() {
  return (
    <section id="technologies" className="scroll-mt-28 bg-[#eaf7fa] py-16 sm:py-20 lg:py-28" dir="rtl">
      <div className="mx-auto max-w-[1180px] px-4 sm:px-6">
        <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
          <h2 className="text-[28px] font-black leading-[1.5] text-[#111] sm:text-[36px] sm:leading-[1.35]">
            فناوری‌ها و روش‌های <br />
            پیشگام در دندان‌سازی
          </h2>
          <p className="max-w-[690px] text-[15px] leading-8 text-[#555] sm:text-base lg:justify-self-start">
            از ثبت اطلاعات درمان تا ساخت نهایی، جریان دیجیتال یکپارچه دقت، سرعت و قابلیت پیگیری هر سفارش را افزایش می‌دهد؛ بدون آن‌که کیفیت بالینی قربانی سرعت شود.
          </p>
        </div>

        <div className="mt-10 flex flex-col gap-6 lg:mt-16 lg:gap-16">
          {technologies.map((technology, index) => (
            <article
              key={technology.title}
              className={`grid overflow-hidden rounded-sm border-2 border-[#9BD8E4] bg-white/45 shadow-[0_16px_45px_rgba(57,143,156,0.09)] lg:min-h-[360px] lg:grid-cols-2 ${index % 2 === 1 ? "lg:[&_.tech-media]:order-2" : ""}`}
            >
              <div className="tech-media relative min-h-[240px] sm:min-h-[320px] lg:min-h-full">
                <Image src={technology.image} alt={technology.title} fill sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover" />
              </div>
              <div className="flex flex-col justify-center p-6 sm:p-10 lg:px-12 lg:py-24">
                <span className="w-fit rounded-full bg-[#DAEDF3] px-4 py-1.5 text-sm font-bold text-[#2993A3]">{technology.badge}</span>
                <h3 className="mt-5 text-2xl font-black leading-9 text-[#1B1B1B] sm:text-3xl">{technology.title}</h3>
                <p className="mt-4 text-[15px] leading-8 text-[#555] sm:text-base">{technology.description}</p>
                <a href="#contact" className="mt-7 inline-flex min-h-11 w-fit items-center gap-2 text-sm font-extrabold text-[#2993A3] hover:underline">
                  مشاهده اطلاعات بیشتر
                  <ArrowLeft className="size-4" aria-hidden="true" />
                </a>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
