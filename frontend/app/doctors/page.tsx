import type { Metadata } from "next";

import { AllDoctorsDirectory } from "@/components/doctors/AllDoctorsDirectory";
import { getServerDoctorsPage, getServerPublicCatalog } from "@/lib/server-public-doctors";

export const metadata: Metadata = {
  title: "پزشکان | دنتوتایم",
  description: "مقایسه پزشکان بر اساس تخصص، امتیاز و بیمه و رزرو نوبت آنلاین",
};

export default async function DoctorsPage() {
  const [doctors, catalog] = await Promise.all([
    getServerDoctorsPage("", 1),
    getServerPublicCatalog(),
  ]);
  return <AllDoctorsDirectory doctors={doctors.results} insurances={catalog.insurances} />;
}
