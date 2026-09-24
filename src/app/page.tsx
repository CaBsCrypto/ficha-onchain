import { Navbar } from "@/components/landing/Navbar";
import { HeroSection } from "@/components/landing/HeroSection";
import { ProblemSection } from "@/components/landing/ProblemSection";
import { SolutionSection } from "@/components/landing/SolutionSection";
import { HowItWorksSection } from "@/components/landing/HowItWorksSection";
import { AudienceSection } from "@/components/landing/AudienceSection";

import { WaitlistSection } from "@/components/landing/WaitlistSection";
import { Footer } from "@/components/landing/Footer";
import { LandingBackdrop } from "@/components/landing/LandingBackdrop";

export default function Home() {
  return (
    <LandingBackdrop>
      <Navbar />
      <main className="flex-1">
        <HeroSection />
        <ProblemSection />
        <SolutionSection />
        <HowItWorksSection />
        <AudienceSection />

        <WaitlistSection />
      </main>
      <Footer />
    </LandingBackdrop>
  );
}


