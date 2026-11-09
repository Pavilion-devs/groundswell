// Ported from Twisky (components/marketing/Logo.tsx).
export function Logo() {
  return (
    <div className="flex items-center gap-2">
      <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center">
        <div className="h-4 w-4 rounded-sm bg-primary-foreground" />
      </div>
      <span className="text-xl font-bold text-foreground">Groundswell</span>
    </div>
  );
}
