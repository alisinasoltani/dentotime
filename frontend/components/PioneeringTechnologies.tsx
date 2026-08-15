import React from 'react';
import { ArrowLeft } from 'lucide-react';
import Image from 'next/image';

const technologiesData = [
  {
    id: 1,
    badge: "پیشرفته",
    title: "سیستم‌های پیشرفته CAD/CAM",
    description: "بهره‌گیری از سیستم‌های تراش و ساخت دیجیتال به ما این امکان را می‌دهد که پیچیده‌ترین ساختارهای پروتزی، اباتمنت‌های اختصاصی و روکش‌های سرامیکی را با تطابق میکرونی تولید کنیم. این تکنولوژی سرعت تحویل ارستوریشن‌ها را بدون کوچک‌ترین سازش در کیفیت، به حداکثر می‌رساند.",
    // در طراحی شما، ردیف اول و سوم تصویر در سمت راست و متن در چپ قرار دارد
    imagePosition: "right", 
    imageUrl: "/images/pioneering_technologies_image_2.png",
  },
  {
    id: 2,
    badge: "دیجیتال",
    title: "اسکن دیجیتال دندان‌پزشکی",
    description: "انتقال دقیق آناتومی دهان به محیط نرم‌افزاری، اولین گام در درمان‌های موفق است. با پذیرش و پردازش سریع فایل‌های اسکنر داخل‌دهانی، فرآیند قالب‌گیری سنتی و ناخوشایند حذف شده و بستر طراحی سه‌بعدی با بالاترین میزان هم‌پوشانی و انحنای طبیعی دندان فراهم می‌گردد.",
    // ردیف دوم تصویر در سمت چپ قرار دارد
    imagePosition: "left",
    imageUrl: "/images/pioneering_technologies_image_1.png",
  },
  {
    id: 3,
    badge: "نوآورانه",
    title: "جریان‌های کاری نوین در دندان‌پزشکی",
    description: "ما فراتر از روش‌های معمول، به سوی آینده دندان‌پزشکی گام برمی‌داریم. با همگام‌سازی هوش مصنوعی در طراحی و چاپ سه‌بعدی پیشرفته، زنجیره‌ای یکپارچه از تشخیص تا ساخت نهایی ایجاد کرده‌ایم تا بهینه‌ترین، ایمن‌ترین و بادوام‌ترین راهکارهای درمانی را در اختیارتان قرار دهیم.",
    imagePosition: "right",
    imageUrl: "/images/pioneering_technologies_image_3.png",
  }
];

export default function PioneeringTechnologies() {
  return (
    <section 
      dir="rtl" 
      className="w-full py-16 md:py-24 px-4 sm:px-6 lg:px-28 bg-[linear-gradient(180deg,#EFFAFB_0%,#EFF9FB_30%,#F0FAFC_68%,#F0F9FA_100%)]"
    >
      <div className="max-w-300 mx-auto">
        
        {/* ================= Header Section ================= */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center px-4 gap-6 lg:gap-12">
          {/* Title (Right visually in RTL) */}
          <h2 className="w-full lg:w-5/12 text-3xl text-center md:text-right md:text-4xl lg:text-5xl font-extrabold text-slate-900 leading-tight">
            فناوری‌ها و روش‌های<br className="hidden md:block" />
            <span className="block mt-2">پیشگام در دندان‌سازی</span>
          </h2>
          
          {/* Subtitle (Left visually in RTL) */}
          <p className="w-full lg:w-7/12 text-slate-600 text-base md:text-lg leading-relaxed text-center md:text-right">
            ادغام سیستم‌های پیشرفته CAD/CAM با رویکردهای نوین تشخیصی، استانداردهای تازه‌ای را در دقت ساخت پروتزهای دندانی تعریف کرده است. ما با اتکا بر اتوماسیون دیجیتال و حذف خطاهای سنتی، جریان کاری پیوسته و هوشمندی را برای دندان‌پزشکان فراهم آورده‌ایم که نتیجه آن، ارتقای کیفیت درمان و رضایت کامل بیمار است.
          </p>
        </div>

        {/* ================= Cards Section ================= */}
        <div className="mt-10 lg:mt-[80px] flex flex-col gap-8 lg:gap-[64px] px-2 lg:px-16">
          {technologiesData.map((item) => (
            <div 
              key={item.id}
              className={`flex flex-col lg:flex-row items-stretch rounded-[40px] border-[3px] border-[#9BD8E4] bg-[#F0FAFC]/40 overflow-hidden shadow-sm transition-transform hover:-translate-y-1 duration-300 ${item.imagePosition === 'left' ? 'lg:flex-row-reverse' : ''}`}
            >
              
              {/* Image Container (Placeholder for Next/Image) */}
              <div className="w-full lg:w-5/12 h-[250px] sm:h-[300px] lg:h-auto relative bg-slate-200">
                {/* هنگام اتصال تصویر واقعی، می‌توانید از تگ زیر استفاده کنید:
                  <Image src="..." alt={item.title} fill className="object-cover" />
                */}
                <div className="absolute inset-0 flex items-center justify-center text-slate-400 font-medium">
                  <Image src={item.imageUrl} fill sizes="(min-width: 1024px) 42vw, 100vw" alt='' />
                </div>
              </div>

              {/* Content Container */}
              <div className="w-full lg:w-7/12 p-8 lg:p-12 flex flex-col justify-center">
                
                {/* Badge */}
                <div className="mb-6">
                  <span className="inline-block bg-[#DAEDF3] text-[#2993A3] px-4 py-1.5 rounded-full text-sm font-bold">
                    {item.badge}
                  </span>
                </div>

                {/* Title */}
                <h3 className="text-2xl md:text-3xl font-bold text-slate-900 mb-4">
                  {item.title}
                </h3>

                {/* Description */}
                <p className="text-slate-600 text-base md:text-lg leading-relaxed mb-8">
                  {item.description}
                </p>

                {/* Read More Link */}
                <div className="mt-auto">
                  <a 
                    href="#" 
                    className="inline-flex items-center gap-2 text-[#2993A3] font-bold text-lg group transition-all"
                  >
                    مشاهده اطلاعات بیشتر
                    <ArrowLeft className="w-5 h-5 transition-transform group-hover:-translate-x-1" />
                  </a>
                </div>

              </div>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
}
