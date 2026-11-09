// The landing page, ported from Twisky's marketing page ((marketing)/page.tsx
// and layout.tsx). Public: it calls no actions, so it renders signed out.
import { CallToAction } from "@/components/landing/CallToAction";
import { Features } from "@/components/landing/Features";
import { Footer } from "@/components/landing/Footer";
import { Header } from "@/components/landing/Header";
import { HeroSection } from "@/components/landing/HeroSection";

const TITLE = "Groundswell · Turn feedback into fixes";
const DESCRIPTION =
  "Groundswell sorts GitHub issues, CSVs and notes into problems ranked by real evidence, learns from every card you drag, and files the top ones as issues.";

export function meta() {
  return [
    { title: TITLE },
    { name: "description", content: DESCRIPTION },
    { property: "og:title", content: TITLE },
    { property: "og:description", content: DESCRIPTION },
  ];
}

export default function Landing() {
  return (
    <div className="gs-app font-inter min-h-screen flex flex-col bg-background text-foreground overflow-y-auto h-screen">
      <Header />
      <main className="flex-1 pt-16">
        <div className="flex flex-col">
          <HeroSection />
          <Features />
          <CallToAction />
        </div>
      </main>
      <Footer />
    </div>
  );
}
