import type { Metadata } from "next";

import { AllDoctorsDirectory } from "@/components/doctors/AllDoctorsDirectory";

export const metadata: Metadata = {
  title: "دندان‌پزشکان | دنتوتایم",
  description: "مقایسه دندان‌پزشکان بر اساس تخصص، امتیاز و بیمه و رزرو نوبت آنلاین",
};

export default function DoctorsPage() {
  return <AllDoctorsDirectory />;
}
