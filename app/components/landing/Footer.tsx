// Ported from Twisky (components/marketing/Footer.tsx).
import { Logo } from "./Logo";

export function Footer() {
  return (
    <footer className="w-full py-12 px-4 md:px-12 border-t border-border bg-card">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-8">
          <div className="space-y-4 max-w-sm">
            <Logo />
            <p className="text-muted-foreground text-sm">
              Turns raw feedback into ranked problems with real quotes, shaped by you and an agent together.
            </p>
          </div>
          <nav className="flex items-center gap-6 text-sm">
            <a href="#features" className="text-muted-foreground hover:text-foreground transition-colors">Features</a>
            <a href="#board" className="text-muted-foreground hover:text-foreground transition-colors">Board</a>
          </nav>
        </div>
        <div className="mt-10 pt-6 border-t border-border text-muted-foreground text-sm">
          Built on Agent-Native for the Builder.io Agent-Native Hackathon.
        </div>
      </div>
    </footer>
  );
}
