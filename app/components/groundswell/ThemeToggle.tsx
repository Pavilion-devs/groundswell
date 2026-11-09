// Ported from Twisky (components/ui/theme-toggle.tsx).
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { Switch } from "@/components/ui/switch";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const isLight = resolvedTheme !== "dark";

  return (
    <div className="flex items-center gap-2">
      <Moon size={16} className={!isLight ? "text-primary" : "text-muted-foreground"} aria-hidden="true" />
      <Switch
        checked={isLight}
        onCheckedChange={(checked) => setTheme(checked ? "light" : "dark")}
        className="data-[state=checked]:bg-primary"
        aria-label="Light mode"
      />
      <Sun size={16} className={isLight ? "text-primary" : "text-muted-foreground"} aria-hidden="true" />
    </div>
  );
}
