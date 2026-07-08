import { Link, useLocation } from "wouter";
import {
  LayoutGrid,
  Activity,
  FileCode2,
  Search,
  Bell,
  EyeOff,
  ChevronDown,
  Sparkles,
} from "lucide-react";
import { ReactNode, useEffect } from "react";

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();

  useEffect(() => {
    document.documentElement.classList.remove("dark");
  }, []);

  const navGroups = [
    {
      label: undefined,
      items: [{ href: "/", label: "Overview", icon: LayoutGrid }],
    },
    {
      label: "MONITOR",
      items: [
        { href: "/dashboard", label: "Coherence Dashboard", icon: Activity },
      ],
    },
    {
      label: "PROTOCOL",
      items: [{ href: "/contracts", label: "Contracts", icon: FileCode2 }],
    },
  ];

  const pageTitle =
    location === "/"
      ? "Overview"
      : location === "/dashboard"
        ? "Coherence Dashboard"
        : location === "/contracts"
          ? "Contracts"
          : "AETHER";

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      {/* Sidebar */}
      <aside className="hidden md:flex w-64 shrink-0 flex-col bg-white border-r border-border h-screen sticky top-0">
        <div className="h-16 flex items-center gap-2 px-5 border-b border-border">
          <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-bold text-[17px] tracking-tight">AETHER</span>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-5 flex flex-col gap-6">
          {navGroups.map((group, gi) => (
            <div key={gi} className="flex flex-col gap-1">
              {group.label && (
                <div className="px-3 mb-1 text-[11px] font-semibold tracking-wider text-muted-foreground">
                  {group.label}
                </div>
              )}
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = location === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-accent text-accent-foreground"
                        : "text-foreground/70 hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="p-4 border-t border-border">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            BOT Chain · Testnet
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-16 sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-border flex items-center gap-4 px-4 md:px-8">
          <div className="flex items-center gap-2 md:hidden">
            <div className="w-6 h-6 rounded-md bg-primary flex items-center justify-center">
              <Sparkles className="w-3.5 h-3.5 text-primary-foreground" />
            </div>
            <span className="font-bold text-sm">AETHER</span>
          </div>

          <div className="hidden md:flex items-center gap-1.5 text-sm font-medium">
            <span>Behavioral Clearing Network</span>
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
          </div>

          <div className="flex-1 max-w-md ml-2 hidden sm:flex">
            <div className="w-full flex items-center gap-2 bg-muted rounded-lg px-3 py-2 text-sm text-muted-foreground">
              <Search className="w-4 h-4" />
              <span>Search entities, PMOs, contracts...</span>
            </div>
          </div>

          <div className="flex-1" />

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Live · Testnet
          </div>

          <button className="w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors">
            <EyeOff className="w-4 h-4" />
          </button>
          <button className="w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors">
            <Bell className="w-4 h-4" />
          </button>
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-white text-xs font-bold">
            AE
          </div>
        </header>

        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
