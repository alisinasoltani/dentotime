import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ServiceDirectory } from "@/components/services/ServiceDirectory";
import { getServerDoctorsPage, getServerPublicCatalog } from "@/lib/server-public-doctors";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const catalog = await getServerPublicCatalog();
  const service = catalog.services.find((item) => item.slug === slug);
  return {
    title: service ? `${service.title} | دنتوتایم` : "خدمت | دنتوتایم",
    description: service?.description ?? "خدمات دندان‌پزشکی دنتوتایم",
  };
}

export default async function ServicePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [catalog, doctors] = await Promise.all([
    getServerPublicCatalog(),
    getServerDoctorsPage("", 1),
  ]);
  const service = catalog.services.find((item) => item.slug === slug);
  if (!service) notFound();
  return (
    <ServiceDirectory
      service={service}
      doctors={doctors.results}
      insurances={catalog.insurances}
    />
  );
}
