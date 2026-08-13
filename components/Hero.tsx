// components/Hero.tsx
import Link from 'next/link';

export default function Hero() {
  return (
    <section className="px-4 pt-4 pb-8 w-full max-w-[1920px] mx-auto">
      {/* Container with 16px (mx-4) margins and 28px border radius.
        Placeholder image should be replaced in your public folder or external next/image optimized loader.
      */}
      <div 
        className="relative flex min-h-[500px] lg:min-h-[770px] w-full flex-col justify-center rounded-[28px] overflow-hidden bg-slate-50 bg-[url('/images/hero_image.png')] bg-cover bg-center md:bg-right-top"
      >
        {/* Soft overlay to ensure text contrast on mobile/tablet if image is busy */}
        <div className="absolute inset-0 bg-white/40 lg:bg-transparent bg-gradient-to-l"></div>
        
        {/* Content Wrapper */}
        <div className="relative z-10 w-full max-w-7xl mx-auto px-6 sm:px-12 lg:px-20 text-right">
          <div className="max-w-2xl">
            <h1 className="text-4xl sm:text-5xl lg:text-[56px] font-extrabold leading-[1.2] text-slate-900 mb-6 drop-shadow-sm">
              راهکارهای دقیق و<br />تخصصی دندانپزشکی
            </h1>
            
            <p className="text-base sm:text-lg lg:text-xl text-slate-700 mb-10 leading-relaxed font-medium max-w-md">
              جایی که فناوری دیجیتال و هنر دندانسازی در کنار هم قرار می‌گیرند تا بهترین نتیجه را خلق کنند.
            </p>
            
            <Link 
              href="#contact" 
              className="inline-flex items-center justify-center rounded-full bg-[linear-gradient(90deg,#2993A3_0%,#75C1C7_100%)] px-8 py-3.5 text-base lg:text-lg font-bold text-white shadow-lg transition-transform hover:-translate-y-0.5 hover:shadow-xl"
            >
              درخواست مشاوره
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}