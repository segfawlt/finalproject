import { useAuthStore } from "../stores/authStore";
import { Sparkles, ShieldCheck, Zap, Workflow } from "lucide-react";

export default function Login() {
  const login = useAuthStore((state) => state.login);

  return (
    <div className="min-h-screen bg-discord-bg relative overflow-hidden flex items-center justify-center px-4">
      <div
        className="absolute inset-0 -z-10 opacity-70"
        aria-hidden
        style={{
          backgroundImage:
            "radial-gradient(ellipse 60% 50% at 50% 0%, rgba(88,101,242,0.35), transparent 60%), radial-gradient(ellipse 40% 40% at 80% 100%, rgba(124,92,255,0.25), transparent 60%)",
        }}
      />
      <div
        className="absolute inset-0 -z-10 opacity-[0.04]"
        aria-hidden
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />

      <div className="relative w-full max-w-md">
        <div className="flex flex-col items-center text-center mb-8">
          <div className="relative mb-5">
            <div
              className="absolute inset-0 rounded-2xl blur-2xl bg-discord-accent/40"
              aria-hidden
            />
            <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-discord-accent to-indigo-500 flex items-center justify-center shadow-lg shadow-discord-accent/30">
              <Sparkles size={28} className="text-white" strokeWidth={1.75} />
            </div>
          </div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-discord-text-muted font-semibold mb-2">
            Discord Platform
          </div>
          <h1 className="text-3xl font-semibold text-discord-text tracking-tight">
            Design your server in plain language.
          </h1>
          <p className="text-discord-text-muted text-sm mt-3 max-w-sm leading-relaxed">
            AI plans, previews, and executes your Discord server configuration — channels, roles,
            and permissions — through a review-first workflow.
          </p>
        </div>

        <div className="rounded-xl border border-discord-divider bg-discord-bg-secondary/80 backdrop-blur-md p-6 shadow-2xl shadow-black/40">
          <button
            onClick={login}
            className="w-full inline-flex items-center justify-center gap-2.5 px-5 py-3 bg-discord-accent hover:bg-discord-accent-hover text-white rounded-md font-medium transition-colors shadow-lg shadow-discord-accent/20"
          >
            <DiscordIcon />
            Sign in with Discord
          </button>

          <div className="mt-5 grid grid-cols-3 gap-2">
            <Feature icon={Workflow} label="Plan-first" />
            <Feature icon={ShieldCheck} label="Review" />
            <Feature icon={Zap} label="Execute" />
          </div>

          <p className="text-[11px] text-discord-text-subtle text-center mt-5">
            By continuing, you authorize this app to manage servers you administer.
          </p>
        </div>
      </div>
    </div>
  );
}

function Feature({ icon: Icon, label }: { icon: typeof Sparkles; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5 px-2 py-2.5 rounded-md bg-discord-bg-tertiary/60 border border-discord-divider">
      <Icon size={14} className="text-discord-text-muted" strokeWidth={1.75} />
      <span className="text-[10px] uppercase tracking-wider text-discord-text-muted font-semibold">
        {label}
      </span>
    </div>
  );
}

function DiscordIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}
