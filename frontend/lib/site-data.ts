export type Service = {
  slug: string;
  title: string;
  shortTitle: string;
  description: string;
  icon: string;
};

export type Dentist = {
  id: string;
  firstName: string;
  lastName: string;
  specialty: string;
  serviceSlugs: string[];
  rating: number;
  reviews: number;
  image: string;
  clinic: string;
  address: string;
  insurances: string[];
  experience: string;
  bio: string;
};

export const services: Service[] = [
  {
    slug: "consultation",
    title: "مشاوره درمانی دندان‌پزشکی",
    shortTitle: "مشاوره درمانی",
    description: "بررسی اولیه، تشخیص مسیر درمان و انتخاب متخصص مناسب",
    icon: "messages",
  },
  {
    slug: "cosmetic-prosthesis",
    title: "پروتز زیبایی",
    shortTitle: "پروتز زیبایی",
    description: "روکش، لمینت و پروتزهای ثابت با طراحی دقیق لبخند",
    icon: "sparkles",
  },
  {
    slug: "maxillofacial",
    title: "جراحی دهان، فک و صورت",
    shortTitle: "فک و صورت",
    description: "درمان تخصصی ناهنجاری‌ها، جراحی فک و دندان نهفته",
    icon: "scan-face",
  },
  {
    slug: "endodontics",
    title: "درمان ریشه (عصب‌کشی)",
    shortTitle: "درمان ریشه",
    description: "درمان تخصصی پالپ و ریشه دندان با حفظ حداکثری بافت",
    icon: "activity",
  },
  {
    slug: "general-dentistry",
    title: "دندان‌پزشکی عمومی",
    shortTitle: "دندان‌پزشکی عمومی",
    description: "معاینه، ترمیم، جرم‌گیری و مراقبت‌های دوره‌ای",
    icon: "stethoscope",
  },
  {
    slug: "orthodontics",
    title: "ارتودنسی و ناهنجاری‌های فک",
    shortTitle: "ارتودنسی",
    description: "مرتب‌سازی دندان‌ها و اصلاح روابط فکی کودکان و بزرگسالان",
    icon: "align-center",
  },
  {
    slug: "periodontics",
    title: "بیماری‌های لثه (پریودانتیکس)",
    shortTitle: "درمان لثه",
    description: "درمان بافت نگهدارنده دندان، جراحی لثه و آماده‌سازی ایمپلنت",
    icon: "shield",
  },
  {
    slug: "pediatric-dentistry",
    title: "دندان‌پزشکی کودکان",
    shortTitle: "دندان‌پزشکی کودکان",
    description: "پیشگیری و درمان تخصصی دندان کودکان و نوجوانان",
    icon: "baby",
  },
  {
    slug: "restorative-cosmetic",
    title: "ترمیمی و زیبایی",
    shortTitle: "ترمیمی و زیبایی",
    description: "بازسازی محافظه‌کارانه دندان و اصلاح فرم و رنگ لبخند",
    icon: "wand",
  },
  {
    slug: "oral-medicine",
    title: "بیماری‌های دهان، فک و صورت",
    shortTitle: "بیماری‌های دهان",
    description: "تشخیص و درمان ضایعات و بیماری‌های بافت نرم دهان",
    icon: "search",
  },
  {
    slug: "oral-radiology",
    title: "رادیولوژی دهان، فک و صورت",
    shortTitle: "رادیولوژی دهان",
    description: "تصویربرداری تخصصی و تفسیر دقیق ساختارهای فک و دندان",
    icon: "scan-line",
  },
  {
    slug: "implant",
    title: "ایمپلنت و بازسازی دندان",
    shortTitle: "ایمپلنت",
    description: "جایگزینی دندان از دست رفته با برنامه‌ریزی دیجیتال",
    icon: "circle-dot",
  },
];

export const insurers = [
  "آزاد",
  "بیمه سلامت ایران",
  "تأمین اجتماعی",
  "نیروهای مسلح",
  "بیمه دانا",
  "بیمه آسیا",
  "بیمه ایران",
  "بیمه دی",
  "بیمه البرز",
  "بیمه سامان",
  "بیمه پاسارگاد",
  "بیمه کوثر",
];

export const dentists: Dentist[] = [
  {
    id: "arman-hosseini",
    firstName: "آرمان",
    lastName: "حسینی",
    specialty: "متخصص درمان ریشه",
    serviceSlugs: ["endodontics", "consultation", "general-dentistry"],
    rating: 4.9,
    reviews: 156,
    image: "/images/doctors/arman-hosseini.webp",
    clinic: "کلینیک تخصصی سپیدار",
    address: "تهران، خیابان ولیعصر، بالاتر از میدان ونک، پلاک ۱۸۳",
    insurances: ["بیمه سلامت ایران", "بیمه دانا", "بیمه سامان"],
    experience: "۱۴ سال سابقه درمان تخصصی",
    bio: "تمرکز حرفه‌ای بر درمان‌های پیچیده ریشه، درمان مجدد و حفظ دندان‌های طبیعی با استفاده از میکروسکوپ دندان‌پزشکی.",
  },
  {
    id: "nazanin-karimi",
    firstName: "نازنین",
    lastName: "کریمی",
    specialty: "متخصص پروتزهای دندانی",
    serviceSlugs: ["cosmetic-prosthesis", "implant", "restorative-cosmetic"],
    rating: 4.8,
    reviews: 98,
    image: "/images/doctors/nazanin-karimi.webp",
    clinic: "مرکز دندان‌پزشکی آبان",
    address: "تهران، سعادت‌آباد، بلوار دریا، خیابان صراف‌ها، پلاک ۲۱",
    insurances: ["بیمه ایران", "بیمه آسیا", "بیمه پاسارگاد"],
    experience: "۱۱ سال سابقه طراحی و بازسازی لبخند",
    bio: "متخصص پروتزهای ثابت و متحرک با رویکرد دیجیتال در طراحی لبخند، روکش‌های سرامیکی و بازسازی‌های متکی بر ایمپلنت.",
  },
  {
    id: "sara-moradi",
    firstName: "سارا",
    lastName: "مرادی",
    specialty: "متخصص دندان‌پزشکی کودکان",
    serviceSlugs: ["pediatric-dentistry", "consultation"],
    rating: 4.9,
    reviews: 125,
    image: "/images/doctors/sara-moradi.webp",
    clinic: "مرکز کودکان لبخند",
    address: "تهران، پاسداران، خیابان گلستان پنجم، پلاک ۴۴",
    insurances: ["تأمین اجتماعی", "بیمه سلامت ایران", "بیمه کوثر"],
    experience: "۱۲ سال تجربه درمان کودک و نوجوان",
    bio: "درمان‌های پیشگیرانه و ترمیمی کودک با تمرکز بر کاهش اضطراب، آموزش خانواده و ایجاد تجربه‌ای امن برای اولین مراجعات دندان‌پزشکی.",
  },
  {
    id: "reza-ahmadi",
    firstName: "رضا",
    lastName: "احمدی",
    specialty: "متخصص جراحی دهان، فک و صورت",
    serviceSlugs: ["maxillofacial", "implant", "consultation"],
    rating: 4.7,
    reviews: 73,
    image: "/images/doctors/reza-ahmadi.webp",
    clinic: "بیمارستان دندان‌پزشکی مهر",
    address: "تهران، شهرک غرب، بلوار فرحزادی، مجتمع پزشکی مهر",
    insurances: ["نیروهای مسلح", "بیمه دی", "بیمه دانا"],
    experience: "۱۶ سال سابقه جراحی تخصصی",
    bio: "جراحی دندان‌های نهفته، بازسازی استخوان، جراحی ایمپلنت و درمان ناهنجاری‌های فکی با برنامه‌ریزی سه‌بعدی.",
  },
  {
    id: "parisa-ebrahimi",
    firstName: "پریسا",
    lastName: "ابراهیمی",
    specialty: "متخصص ارتودنسی",
    serviceSlugs: ["orthodontics", "consultation"],
    rating: 4.8,
    reviews: 111,
    image: "/images/doctors/parisa-ebrahimi.webp",
    clinic: "کلینیک ارتودنسی هما",
    address: "تهران، قیطریه، بلوار صبا، کوچه روشن، پلاک ۷",
    insurances: ["بیمه البرز", "بیمه سامان", "بیمه پاسارگاد"],
    experience: "۱۳ سال درمان ارتودنسی ثابت و شفاف",
    bio: "درمان ناهنجاری‌های دندانی و فکی کودکان و بزرگسالان با روش‌های ثابت، متحرک و الاینرهای شفاف.",
  },
  {
    id: "milad-sadeghi",
    firstName: "میلاد",
    lastName: "صادقی",
    specialty: "متخصص بیماری‌های لثه",
    serviceSlugs: ["periodontics", "implant", "consultation"],
    rating: 4.6,
    reviews: 86,
    image: "/images/doctors/milad-sadeghi.webp",
    clinic: "درمانگاه تخصصی نیایش",
    address: "تهران، جردن، خیابان گلشهر، پلاک ۹۶",
    insurances: ["بیمه آسیا", "بیمه ایران", "تأمین اجتماعی"],
    experience: "۱۰ سال درمان تخصصی لثه و ایمپلنت",
    bio: "درمان بیماری‌های پیشرفته لثه، پیوند بافت نرم و سخت و آماده‌سازی بافت برای درمان‌های ایمپلنت و زیبایی.",
  },
  {
    id: "leila-rahmani",
    firstName: "لیلا",
    lastName: "رحمانی",
    specialty: "متخصص رادیولوژی دهان، فک و صورت",
    serviceSlugs: ["oral-radiology", "consultation"],
    rating: 4.8,
    reviews: 64,
    image: "/images/doctors/leila-rahmani.webp",
    clinic: "مرکز تصویربرداری دهان پرتو",
    address: "تهران، میدان آرژانتین، خیابان الوند، ساختمان پزشکان پرتو",
    insurances: ["بیمه دی", "بیمه دانا", "بیمه سلامت ایران"],
    experience: "۹ سال تفسیر تصویربرداری تخصصی",
    bio: "تصویربرداری پانورامیک، سفالومتری و CBCT و تفسیر تخصصی ضایعات، ساختارهای فکی و برنامه‌ریزی پیش از جراحی.",
  },
  {
    id: "nima-farhadi",
    firstName: "نیما",
    lastName: "فرهادی",
    specialty: "متخصص بیماری‌های دهان، فک و صورت",
    serviceSlugs: ["oral-medicine", "consultation", "general-dentistry"],
    rating: 4.7,
    reviews: 79,
    image: "/images/doctors/nima-farhadi.webp",
    clinic: "کلینیک تشخیص بیماری‌های دهان آرام",
    address: "تهران، یوسف‌آباد، خیابان شصت و چهارم، پلاک ۱۲",
    insurances: ["بیمه ایران", "تأمین اجتماعی", "بیمه آسیا"],
    experience: "۱۲ سال تشخیص و درمان ضایعات دهانی",
    bio: "تشخیص و درمان غیرجراحی بیماری‌های مخاط دهان، دردهای دهانی‌صورتی و پیگیری ضایعات نیازمند ارزیابی تخصصی.",
  },
];

export const getService = (slug: string) =>
  services.find((service) => service.slug === slug) ?? services[0];

export const getDentist = (id: string) =>
  dentists.find((dentist) => dentist.id === id) ?? dentists[0];
