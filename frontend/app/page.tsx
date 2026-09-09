import BookingSection from "@/components/BookingSection";
import FeaturesSection from "@/components/FeaturesSection";
import Footer from "@/components/Footer";
import Hero from "@/components/Hero";
import PioneeringTechnologies from "@/components/PioneeringTechnologies";
import Services from "@/components/Services";
import DoctorsPreview from "@/components/home/DoctorsPreview";
import { getServerDoctorPreview, getServerPublicCatalog } from "@/lib/server-public-doctors";

export default async function Home() {
  const [doctors, catalog] = await Promise.all([
    getServerDoctorPreview(),
    getServerPublicCatalog(),
  ]);
  return (
    <div>
      <main>
        <Hero />
        <Services services={catalog.services} />
        <DoctorsPreview doctors={doctors} insurances={catalog.insurances} />
        <BookingSection services={catalog.services} insurances={catalog.insurances} />
        <PioneeringTechnologies />
        <FeaturesSection />
        <Footer />
      </main>
    </div>
  );
}
