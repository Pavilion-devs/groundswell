// The page's one call to action: open the app on the demo board's dashboard.
// Styled like Twisky's hero "Get Started" button.
import { ArrowRight } from "lucide-react";
import { Link } from "react-router";

import { cn } from "@/lib/utils";

export function OpenAppButton({ size = "default" }: { size?: "default" | "lg" }) {
  return (
    <Link
      to="/boards"
      className={cn(
        "group inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground font-medium transition-all duration-300 hover:bg-primary/90 hover:scale-105 hover:shadow-xl hover:shadow-primary/30 relative overflow-hidden",
        size === "lg" ? "text-lg h-14 px-10 rounded-xl" : "text-base h-12 px-8",
      )}
    >
      <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
      <span className="relative flex items-center gap-2">
        Open the dashboard
        <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
      </span>
    </Link>
  );
}
