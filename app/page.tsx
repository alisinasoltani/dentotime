import BookingSection from "@/components/BookingSection";
import FeaturesSection from "@/components/FeaturesSection";
import Footer from "@/components/Footer";
import Hero from "@/components/Hero";
import PioneeringTechnologies from "@/components/PioneeringTechnologies";
import Services from "@/components/Services";
import Image from "next/image";

export default function Home() {
  return (
    <div>
      <main>
        <Hero />
        <Services />
        <BookingSection />
        <PioneeringTechnologies />
        <FeaturesSection />
        <Footer />
      </main>
    </div>
  );
}
