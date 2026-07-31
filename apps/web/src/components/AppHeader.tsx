import { Link, useLocation } from "react-router-dom";
import { LogOut, LayoutGrid } from "lucide-react";
import { useAuthStore } from "../stores/authStore";

function BrandMark() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <linearGradient
          id="dp-brand-gradient"
          x1="0"
          y1="0"
          x2="24"
          y2="24"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#5865f2" />
          <stop offset="1" stopColor="#7c5cff" />
        </linearGradient>
      </defs>
      <path d="M12 1.85 21.4 7v10L12 22.15 2.6 17V7L12 1.85Z" fill="url(#dp-brand-gradient)" />
      <path
        d="M8.6 8.4v7.2M15.4 8.4v7.2M8.6 12h6.8"
        stroke="#fff"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

interface NavLink {
  to: string;
  label: string;
  icon: typeof LayoutGrid;
  match: (path: string) => boolean;
}

const NAV_LINKS: NavLink[] = [
  { to: "/studio", label: "Studio", icon: LayoutGrid, match: (p) => p.startsWith("/studio") },
];

export default function AppHeader() {
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const logout = useAuthStore((s) => s.logout);
  const location = useLocation();

  if (!isAuthenticated) return null;

  return (
    <header className="sticky top-0 z-40 h-14 bg-shell-canvas/85 backdrop-blur-md border-b border-shell-border">
      <div className="h-full max-w-screen-2xl mx-auto px-4 sm:px-6 flex items-center gap-4">
        <Link
          to="/studio"
          className="flex items-center gap-2.5 shrink-0 group"
          aria-label="Discord Platform home"
        >
          <span className="inline-flex items-center justify-center transition-transform group-hover:scale-105">
            <BrandMark />
          </span>
          <span className="text-shell-text font-semibold text-sm tracking-tight">
            Discord Platform
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-1 ml-2">
          {NAV_LINKS.map((link) => {
            const Icon = link.icon;
            const active = link.match(location.pathname);
            return (
              <Link
                key={link.to}
                to={link.to}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                  active
                    ? "bg-shell-surface3 text-shell-text"
                    : "text-shell-text-muted hover:text-shell-text hover:bg-shell-surface2"
                }`}
              >
                <Icon size={14} strokeWidth={1.75} />
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex-1" />

        {user && (
          <div className="flex items-center gap-2.5">
            <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded bg-shell-surface2/60 border border-shell-border">
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-shell-surface3 to-shell-border-strong flex items-center justify-center text-[10px] font-semibold text-shell-text shrink-0">
                {getInitials(user.name)}
              </div>
              <div className="text-xs leading-tight">
                <div className="text-shell-text font-medium truncate max-w-[120px]">
                  {user.name}
                </div>
              </div>
            </div>
            <button
              onClick={logout}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs text-shell-text-muted hover:text-shell-text hover:bg-shell-surface2 transition-colors"
              aria-label="Sign out"
            >
              <LogOut size={14} strokeWidth={1.75} />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
