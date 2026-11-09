/**
 * Groundswell app shell, ported from the Twisky dashboard
 * (components/layout/sidebar.tsx, topbar.tsx, dashboard-shell.tsx). Markup and
 * classes are Twisky's; navigation, data and the agent toggle are ours.
 */
import { useActionQuery, useSession } from "@agent-native/core/client/hooks";
import { AgentToggleButton } from "@agent-native/toolkit/app/chat";
import { Bell, Columns3, FileText, Home, Inbox, Menu, Plug, Search, Zap } from "lucide-react";
import React from "react";
import { Link, useLocation } from "react-router";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { ThemeToggle } from "./ThemeToggle";

const COLLAPSED_KEY = "gs.sidebarCollapsed";

interface NavItem {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string | null;
  count?: number;
  /** Active only on this exact path (the board route is a prefix of the others). */
  exact?: boolean;
}

function getInitials(fullName?: string, email?: string): string {
  if (fullName) {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length >= 2) return ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase();
    return (parts[0] ?? "").substring(0, 2).toUpperCase();
  }
  if (email) return email.substring(0, 2).toUpperCase();
  return "?";
}

function Sidebar({ items }: { items: NavItem[] }) {
  const { pathname } = useLocation();
  const [collapsed, setCollapsed] = React.useState(false);

  React.useEffect(() => {
    try {
      const saved = localStorage.getItem(COLLAPSED_KEY);
      if (saved !== null) setCollapsed(saved === "true");
    } catch {
      // Storage can be unavailable; the expanded default still works.
    }
  }, []);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(COLLAPSED_KEY, String(next));
    } catch {
      // Ignore storage errors.
    }
  };

  return (
    <nav
      aria-label="Groundswell"
      className={cn("dashboard-sidebar hidden md:block p-5 space-y-6 transition-all duration-300 shrink-0", collapsed ? "w-20" : "w-72")}
    >
      <div className="space-y-3">
        <div className="px-2 pb-2">
          <div className={cn("flex items-center gap-3", collapsed && "justify-center")}>
            {!collapsed && (
              <div className="h-9 w-9 rounded-lg bg-cosmic-accent/20 flex items-center justify-center flex-shrink-0">
                <div className="h-4 w-4 rounded-sm bg-cosmic-accent" />
              </div>
            )}
            {!collapsed && (
              <div className="flex-1">
                <div className="font-semibold text-lg">Groundswell</div>
              </div>
            )}
            <button
              type="button"
              onClick={toggle}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              className="h-9 w-9 rounded-md hover:bg-cosmic-light/5 flex items-center justify-center flex-shrink-0 cursor-pointer"
            >
              <Menu className={cn(collapsed ? "h-5 w-5" : "h-4 w-4")} />
            </button>
          </div>
        </div>
        <div className="space-y-1">
          {items.map((item) => {
            const active = item.href !== null && (pathname === item.href || (!item.exact && pathname.startsWith(item.href + "/")));
            const Icon = item.icon;
            const row = (
              <div
                className={cn(
                  "flex items-center rounded-lg transition-all duration-200",
                  collapsed ? "justify-center px-3 py-2.5" : "justify-between px-3 py-2.5",
                  active
                    ? collapsed
                      ? "bg-cosmic-accent/20 ring-2 ring-cosmic-accent/30 dashboard-active"
                      : "bg-cosmic-light/10 dashboard-active"
                    : item.href
                      ? "dashboard-inactive hover:bg-cosmic-light/5 cursor-pointer"
                      : "dashboard-inactive opacity-60",
                )}
              >
                <div className={cn("flex items-center", collapsed ? "justify-center" : "gap-3")}>
                  <Icon className={cn(collapsed ? "h-5 w-5" : "h-4 w-4", active ? "text-cosmic-accent" : "")} />
                  {!collapsed && <span className={cn(active ? "font-medium" : "")}>{item.label}</span>}
                </div>
                {!collapsed && item.count !== undefined && (
                  <span className="text-xs bg-muted/50 px-2 py-0.5 rounded-full text-muted-foreground">{item.count}</span>
                )}
                {!collapsed && item.href === null && item.count === undefined && <span className="text-[11px] text-muted-foreground">Soon</span>}
              </div>
            );
            return item.href ? (
              <Link key={item.label} to={item.href} className="block" aria-current={active ? "page" : undefined} title={collapsed ? item.label : undefined}>
                {row}
              </Link>
            ) : (
              <div key={item.label} aria-disabled="true" title={`${item.label}: coming next`}>
                {row}
              </div>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

function Topbar({
  search,
  onSearch,
  reviewCount,
  reviewHref,
}: {
  search: string;
  onSearch: (value: string) => void;
  reviewCount: number;
  reviewHref: string;
}) {
  const { session } = useSession();
  const initials = getInitials(session?.name, session?.email);
  return (
    <div className="flex items-center justify-between gap-4 px-6 py-4 dashboard-header">
      <div />
      <div className="flex-1 max-w-md">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          {/* Twisky's Input (components/ui/input.tsx) classes, verbatim. */}
          <input
            type="search"
            aria-label="Search reports and problems"
            placeholder="Search reports, problems, people..."
            className="flex h-10 w-full rounded-md border border-input bg-background pr-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:text-sm pl-10 bg-cosmic-light/10 border-cosmic-light/20 hover:bg-cosmic-light/20 focus:bg-cosmic-light/20 transition-colors"
            style={{ paddingLeft: "2.5rem" }}
            value={search}
            onChange={(e) => onSearch(e.target.value)}
          />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon" className="relative hover:bg-cosmic-light/20 transition-colors">
          <Link to={reviewHref} aria-label={`${reviewCount} reports need review`}>
            <Bell className="h-4 w-4" />
            {reviewCount > 0 && (
              <Badge variant="destructive" className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs">
                {reviewCount > 9 ? "9+" : reviewCount}
              </Badge>
            )}
          </Link>
        </Button>
        <div className="flex items-center gap-2 h-9 px-4 rounded-lg bg-cosmic-light/10 hover:bg-cosmic-light/20 transition-colors">
          <ThemeToggle />
          <div className="h-6 w-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium" aria-label={session?.email ?? "Signed in"}>
            {initials}
          </div>
        </div>
        <AgentToggleButton />
      </div>
    </div>
  );
}

export interface GsShellProps {
  boardId: string;
  search: string;
  onSearch: (value: string) => void;
  children: React.ReactNode;
}

export function GsShell({ boardId, search, onSearch, children }: GsShellProps) {
  const base = `/boards/${boardId}`;
  // Same queries as the pages use, so the counts are shared and live.
  const board = useActionQuery("get-board", { id: boardId });
  const priorities = useActionQuery("get-priorities", { boardId });
  const noteCount = board.data?.counts.notes;
  const reviewCount = board.data?.counts.unsorted ?? 0;
  const problemCount = priorities.data ? priorities.data.themes.filter((t) => !t.internal).length : undefined;
  const items: NavItem[] = [
    { label: "Dashboard", icon: Home, href: `${base}/dashboard` },
    { label: "Board", icon: Columns3, href: base, exact: true, ...(problemCount !== undefined ? { count: problemCount } : {}) },
    { label: "Review", icon: Inbox, href: `${base}/review`, count: reviewCount },
    { label: "Briefs", icon: FileText, href: `${base}/briefs` },
    { label: "Sources", icon: Plug, href: `${base}/sources`, ...(noteCount !== undefined ? { count: noteCount } : {}) },
    { label: "Automations", icon: Zap, href: `${base}/automations` },
  ];
  return (
    <div className="gs-app font-inter flex h-full min-h-0">
      <Sidebar items={items} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Topbar search={search} onSearch={onSearch} reviewCount={reviewCount} reviewHref={`${base}/review`} />
        <main className="flex-1 min-h-0 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
