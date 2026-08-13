import BookingSection from "@/components/BookingSection";
import FeaturesSection from "@/components/FeaturesSection";
import Footer from "@/components/Footer";
import Hero from "@/components/Hero";
import PioneeringTechnologies from "@/components/PioneeringTechnologies";
import Services from "@/components/Services";
import DoctorsPreview from "@/components/home/DoctorsPreview";

export default function Home() {
  return (
    <div>
      <main>
        <Hero />
        <Services />
        <BookingSection />
        <PioneeringTechnologies />
        <FeaturesSection />
        <DoctorsPreview />
        <Footer />
      </main>
    </div>
  );
}
