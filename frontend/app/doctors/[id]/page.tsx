import type { Metadata } from "next";

import { DoctorDetailClient } from "@/components/doctors/doctor-detail-client";
import {
  getServerDoctorDetail,
  getServerDoctorReviews,
} from "@/lib/server-public-doctors";


export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const doctor = await getServerDoctorDetail(id);
  return {
    title: doctor ? `دکتر ${doctor.display_name} | دنتو تایم` : "پزشک | دنتو تایم",
    description: doctor?.clinic_name || "پروفایل و امتیازهای پزشک",
  };
}

export default async function DoctorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [doctor, reviews] = await Promise.all([
    getServerDoctorDetail(id),
    getServerDoctorReviews(id),
  ]);
  return (
    <DoctorDetailClient
      doctorId={id}
      initialDoctor={doctor}
      initialReviews={reviews}
    />
  );
}
