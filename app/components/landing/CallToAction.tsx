// Ported from Twisky (components/marketing/CallToAction.tsx): sliding text,
// magnetic button, parallax glows and the animated background.
import { Sparkles, Star, Zap } from "lucide-react";
import React, { useEffect, useState } from "react";

import { OpenAppButton } from "./OpenAppButton";

function SlidingText({ children, delay, trigger }: { children: React.ReactNode; delay: number; trigger: boolean }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!trigger) {
      setShown(false);
      return;
    }
    const t = setTimeout(() => setShown(true), delay);
    return () => clearTimeout(t);
  }, [delay, trigger]);
  return <div className={`transform transition-all duration-1000 ease-out ${shown ? "translate-x-0 opacity-100" : "translate-x-full opacity-0"}`}>{children}</div>;
}

function Magnetic({ children }: { children: React.ReactNode }) {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  return (
    <div
      className="inline-block"
      onMouseMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        setPos({ x: (e.clientX - r.left - r.width / 2) * 0.15, y: (e.clientY - r.top - r.height / 2) * 0.15 });
      }}
      onMouseLeave={() => setPos({ x: 0, y: 0 })}
      style={{ transform: `translate(${pos.x}px, ${pos.y}px)`, transition: "transform 0.2s ease-out" }}
    >
      {children}
    </div>
  );
}

function AnimatedBackground() {
  return (
    <>
      <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -top-10 -left-10 w-20 h-20 bg-primary/10 rounded-full animate-bounce" style={{ animationDuration: "3s" }} />
        <div className="absolute top-1/4 -right-5 w-16 h-16 bg-primary/15 rounded-full animate-bounce" style={{ animationDelay: "1s", animationDuration: "4s" }} />
        <div className="absolute -bottom-5 left-1/3 w-12 h-12 bg-primary/20 rounded-full animate-bounce" style={{ animationDelay: "2s", animationDuration: "5s" }} />
        <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent animate-pulse" />
        <div className="absolute bottom-0 right-0 w-full h-px bg-gradient-to-l from-transparent via-primary/20 to-transparent animate-pulse" style={{ animationDelay: "1s" }} />
      </div>
      <div className="absolute top-10 right-10 w-6 h-6" aria-hidden="true">
        <Star className="w-full h-full text-primary/40 animate-spin" style={{ animationDuration: "8s" }} />
      </div>
      <div className="absolute bottom-20 left-10 w-8 h-8" aria-hidden="true">
        <Zap className="w-full h-full text-primary/30 animate-pulse" />
      </div>
    </>
  );
}

export function CallToAction() {
  const [visible, setVisible] = useState(false);
  const [mouse, setMouse] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const el = document.getElementById("cta-section");
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(!!entry?.isIntersecting), { threshold: 0.1 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      id="cta-section"
      className="w-full py-20 px-4 md:px-12 bg-gradient-to-br from-background via-card to-background relative overflow-hidden"
      onMouseMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        setMouse({ x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height });
      }}
    >
      <AnimatedBackground />
      <div className="absolute inset-0 cosmic-grid opacity-20" />
      <div
        className="absolute top-1/2 left-1/4 w-[300px] h-[300px] rounded-full transition-transform duration-300 ease-out"
        style={{ transform: `translate(${mouse.x * 20 - 50}px, ${mouse.y * 20 - 50}px)` }}
        aria-hidden="true"
      >
        <div className="w-full h-full opacity-15 bg-primary blur-[80px] animate-pulse" />
      </div>
      <div
        className="absolute top-1/2 right-1/4 w-[400px] h-[400px] rounded-full transition-transform duration-500 ease-out"
        style={{ transform: `translate(${mouse.x * -30}px, ${mouse.y * -20}px)` }}
        aria-hidden="true"
      >
        <div className="w-full h-full opacity-10 bg-primary blur-[100px] animate-pulse" style={{ animationDelay: "1s" }} />
      </div>

      <div className="relative z-10 max-w-4xl mx-auto">
        <div className={`text-center space-y-8 transition-all duration-1000 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}>
          <div className="flex justify-center">
            <SlidingText delay={500} trigger={visible}>
              <div className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-full bg-primary/10 text-primary border border-primary/20 backdrop-blur-sm">
                <Sparkles className="h-4 w-4 animate-pulse" aria-hidden="true" />
                Built on 340 real issues
              </div>
            </SlidingText>
          </div>

          <div className="space-y-4">
            <SlidingText delay={800} trigger={visible}>
              <h2 className="text-4xl md:text-6xl lg:text-7xl font-medium tracking-tighter text-balance">
                Know what to{" "}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-primary to-primary/70">fix next.</span>
              </h2>
            </SlidingText>
            <SlidingText delay={1200} trigger={visible}>
              <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
                Open the demo board, built from the public BuilderIO/agent-native issues, and shape it with the agent.
              </p>
            </SlidingText>
          </div>

          <SlidingText delay={1600} trigger={visible}>
            <div className="pt-6">
              <Magnetic>
                <OpenAppButton size="lg" />
              </Magnetic>
            </div>
          </SlidingText>
        </div>
      </div>
    </section>
  );
}
