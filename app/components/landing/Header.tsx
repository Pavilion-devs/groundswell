// Ported from Twisky (components/marketing/Header.tsx). No sign-in or sign-up
// buttons: the page has one call to action, in the hero and at the end.
import { CircleDot, Columns3, Menu, X } from "lucide-react";
import React, { useState } from "react";
import { Link } from "react-router";

import { ThemeToggle } from "@/components/groundswell/ThemeToggle";
import { cn } from "@/lib/utils";

import { Logo } from "./Logo";

const NAV = [
  { id: "features", label: "Features", icon: CircleDot },
  { id: "board", label: "Board", icon: Columns3 },
] as const;

export function Header() {
  const [active, setActive] = useState<string>("features");
  const [mobileOpen, setMobileOpen] = useState(false);

  const go = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    setActive(id);
    setMobileOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
      <header className="w-full max-w-7xl mx-auto py-3 px-4 md:px-8 flex items-center justify-between">
        <Link to="/" aria-label="Go to home" className="p-3 inline-block">
          <Logo />
        </Link>

        <button
          type="button"
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          className="md:hidden p-3 rounded-2xl text-muted-foreground hover:text-foreground"
          onClick={() => setMobileOpen((o) => !o)}
        >
          {mobileOpen ? <X size={24} /> : <Menu size={24} />}
        </button>

        <nav className="hidden md:flex items-center absolute left-1/2 -translate-x-1/2">
          <div className="rounded-full px-1 py-1 backdrop-blur-md bg-background/80 border border-border shadow-lg flex gap-1">
            {NAV.map(({ id, label, icon: Icon }) => (
              <a
                key={id}
                href={`#${id}`}
                onClick={go(id)}
                className={cn(
                  "px-4 py-2 rounded-full text-sm transition-colors flex items-center",
                  active === id ? "text-accent-foreground bg-accent" : "text-muted-foreground hover:text-foreground hover:bg-muted",
                )}
              >
                <Icon size={16} className="mr-1.5" aria-hidden="true" /> {label}
              </a>
            ))}
          </div>
        </nav>

        {mobileOpen && (
          <div className="md:hidden fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
            <div className="absolute top-20 left-4 right-4 bg-background/95 backdrop-blur-md py-6 px-6 border border-border rounded-2xl shadow-xl">
              <div className="flex flex-col gap-4">
                {NAV.map(({ id, label, icon: Icon }) => (
                  <a
                    key={id}
                    href={`#${id}`}
                    onClick={go(id)}
                    className={cn(
                      "px-3 py-2 text-sm rounded-md transition-colors",
                      active === id ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted",
                    )}
                  >
                    <Icon size={16} className="inline-block mr-1.5" aria-hidden="true" /> {label}
                  </a>
                ))}
                <div className="flex items-center justify-between px-3 py-2">
                  <span className="text-sm text-muted-foreground">Theme</span>
                  <ThemeToggle />
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="hidden md:flex items-center gap-4">
          <ThemeToggle />
        </div>
      </header>
    </div>
  );
}
