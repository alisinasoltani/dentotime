import Image from "next/image";
import { Mail, MapPin, Phone, Smartphone } from "lucide-react";
import { SiInstagram, SiWhatsapp } from "react-icons/si";

const contactItems = [
  { icon: Smartphone, label: "شماره همراه", value: "۰۹۱۲ ۴۶۷ ۳۲۹۱", href: "tel:+989124673291" },
  { icon: Smartphone, label: "شماره همراه", value: "۰۹۱۹ ۲۴۴ ۸۵۶۰", href: "tel:+989192448560" },
  { icon: Phone, label: "تلفن ثابت", value: "۰۲۱ ۸۸۷۷ ۴۲۱۰", href: "tel:+982188774210" },
  { icon: Mail, label: "ایمیل", value: "hello@dentotime.ir", href: "mailto:hello@dentotime.ir" },
];

export default function Footer() {
  return (
    <>
      <section id="contact" className="scroll-mt-28 bg-[linear-gradient(135deg,#ECFCFD_0%,#E0F5F8_48%,#D9F2F5_100%)] py-16 sm:py-20 lg:py-24" dir="rtl">
        <div className="mx-auto max-w-[1180px] px-4 sm:px-6">
          <h2 className="text-[28px] font-black text-[#111] sm:text-[40px]">تماس با ما</h2>
          <p className="mt-3 max-w-[640px] text-[15px] leading-7 text-[#566B6E] sm:text-base">پیش از مراجعه، برای هماهنگی پوشش بیمه یا پرسش درباره روند درمان با ما در ارتباط باشید.</p>

          <div className="mt-10 grid overflow-hidden rounded-sm border border-white/80 bg-white/72 shadow-[0_24px_70px_rgba(50,139,154,0.12)] backdrop-blur-sm lg:grid-cols-[0.88fr_1.12fr]">
            <div className="order-2 flex flex-col justify-center gap-6 border-t border-[#D5EDEF] p-6 sm:p-10 lg:order-1 lg:border-l lg:border-t-0 lg:p-12">
              <div>
                <h3 className="text-xl font-black text-[#222]">راه‌های ارتباطی</h3>
                <p className="mt-2 text-sm leading-7 text-[#66787B]">شنبه تا پنج‌شنبه، ساعت ۸ تا ۲۰ پاسخ‌گوی شما هستیم.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                {contactItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <a key={item.value} href={item.href} className="group flex min-h-14 items-center gap-3 rounded-sm px-2 transition hover:bg-white">
                      <span className="flex size-11 shrink-0 items-center justify-center rounded-sm bg-[#E1FCFC] text-[#2993A3] group-hover:bg-[#2993A3] group-hover:text-white">
                        <Icon className="size-5" aria-hidden="true" />
                      </span>
                      <span>
                        <small className="block text-xs text-[#777]">{item.label}</small>
                        <strong className="mt-1 block text-sm text-[#333]" dir="ltr">{item.value}</strong>
                      </span>
                    </a>
                  );
                })}
              </div>
              <div className="flex items-start gap-3 rounded-sm bg-white/72 p-4">
                <MapPin className="mt-0.5 size-5 shrink-0 text-[#2993A3]" aria-hidden="true" />
                <div>
                  <strong className="text-sm text-[#333]">آدرس</strong>
                  <p className="mt-1 text-sm leading-7 text-[#626F71]">تهران، خیابان ولیعصر، بالاتر از میدان ونک، کوچه نگار، پلاک ۱۸۳، طبقه ۳، واحد ۶</p>
                </div>
              </div>
            </div>

            <div className="order-1 flex flex-col gap-6 p-6 sm:p-10 lg:order-2 lg:p-12">
              <Image src="/images/logo.png" alt="دنتوتایم" width={180} height={64} className="h-14 w-auto self-start object-contain" />
              <p className="max-w-[620px] text-[15px] leading-8 text-[#536467]">
                دنتوتایم یک مسیر روشن برای پیدا کردن خدمات دندان‌پزشکی، مقایسه پزشکان، بررسی بیمه و رزرو نوبت فراهم می‌کند و میان بیمار، پزشک و لابراتوار دیجیتال هماهنگی ایجاد می‌کند.
              </p>
              <a
                href="https://www.openstreetmap.org/?mlat=35.757&mlon=51.411#map=15/35.757/51.411"
                target="_blank"
                rel="noreferrer"
                className="group relative min-h-[260px] overflow-hidden rounded-sm border border-[#B9DEE3] bg-[#EAF7F8] focus-visible:outline-3 focus-visible:outline-[#75C1C7]/50"
                aria-label="مشاهده موقعیت دنتوتایم روی نقشه"
              >
                <Image src="/images/contact-map-vanak.webp" alt="نمای نقشه محدوده میدان ونک" fill sizes="(min-width: 1024px) 55vw, 100vw" className="object-cover transition duration-500 group-hover:scale-[1.02]" />
                <span className="absolute bottom-4 left-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-4 text-sm font-bold text-[#2993A3] shadow-[0_10px_28px_rgba(33,111,123,0.18)]">
                  <MapPin className="size-4" aria-hidden="true" /> مشاهده در نقشه
                </span>
              </a>
            </div>
          </div>
        </div>
      </section>

      <footer className="bg-white" dir="rtl">
        <div className="mx-auto grid min-h-12 max-w-[1180px] items-center gap-4 px-4 py-5 sm:grid-cols-2 sm:px-6">
          <p className="text-center text-sm text-[#45666B] sm:text-right">© ۱۴۰۵ دنتوتایم؛ تمامی حقوق محفوظ است.</p>
          <div className="flex items-center justify-center gap-2 sm:justify-end" aria-label="شبکه‌های اجتماعی دنتوتایم">
            <a href="https://ble.ir" target="_blank" rel="noreferrer" className="flex size-8 items-center justify-center overflow-hidden rounded-full border border-white/80 bg-white text-[#2993A3] shadow-sm transition hover:-translate-y-0.5" aria-label="دنتوتایم در بله">
              <Image src="/icons/bale-logo.png" alt="" width={36} height={36} className="size-full object-cover" />
            </a>
            <a href="https://wa.me/989124673291" target="_blank" rel="noreferrer" className="flex size-8 items-center justify-center rounded-full border border-white/80 bg-white text-[#25D366] shadow-sm transition hover:-translate-y-0.5" aria-label="دنتوتایم در واتساپ">
              <SiWhatsapp className="size-5" aria-hidden="true" />
            </a>
            <a href="https://instagram.com" target="_blank" rel="noreferrer" className="flex size-8 items-center justify-center rounded-full border border-white/80 bg-white text-[#C13584] shadow-sm transition hover:-translate-y-0.5" aria-label="دنتوتایم در اینستاگرام">
              <SiInstagram className="size-5" aria-hidden="true" />
            </a>
          </div>
        </div>
      </footer>
    </>
  );
}
