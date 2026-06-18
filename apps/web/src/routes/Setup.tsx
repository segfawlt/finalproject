import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { ArrowRight, Bot, Check, ChevronRight, Sparkles, Wrench } from "lucide-react";
import { apiFetch } from "../lib/api";

interface GuildSummary {
  id: string;
  name: string;
  icon: string | null;
  memberCount: number;
}

export default function Setup() {
  const { guildId } = useParams<{ guildId: string }>();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);

  // Guild picker state
  const [guilds, setGuilds] = useState<GuildSummary[]>([]);
  const [guildsLoading, setGuildsLoading] = useState(false);
  const [pickedGuildId, setPickedGuildId] = useState<string | null>(guildId ?? null);

  // Bot status
  const [botStatus, setBotStatus] = useState<{ isReady: boolean; guildCount: number } | null>(null);

  // Invite URL
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  useEffect(() => {
    if (step >= 2) {
      setGuildsLoading(true);
      apiFetch("/api/guilds")
        .then((res) => (res.ok ? res.json() : []))
        .then((data: GuildSummary[]) => setGuilds(data))
        .catch(() => setGuilds([]))
        .finally(() => setGuildsLoading(false));
    }
  }, [step]);

  useEffect(() => {
    if (step >= 1) {
      apiFetch("/api/bot/status")
        .then((res) => (res.ok ? res.json() : null))
        .then((data: { isReady: boolean; guildCount: number } | null) => setBotStatus(data))
        .catch(() => setBotStatus(null));
      apiFetch("/api/bot/invite")
        .then((res) => (res.ok ? res.json() : null))
        .then((data: { url?: string } | null) => setInviteUrl(data?.url ?? null))
        .catch(() => setInviteUrl(null));
    }
  }, [step]);

  const steps = [
    { title: "Welcome", icon: Sparkles },
    { title: "Invite the bot", icon: Bot },
    { title: "Pick a guild", icon: Wrench },
  ] as const;

  return (
    <div className="flex-1">
      <div className="max-w-2xl mx-auto p-6 sm:p-8 space-y-6">
        <div>
          <div className="text-xs text-discord-text-muted uppercase tracking-wide font-semibold">
            Setup
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-discord-text mt-1">
            First-time setup
          </h1>
        </div>

        <ol className="flex items-center gap-2">
          {steps.map((s, i) => {
            const Icon = s.icon;
            const isActive = i === step;
            const isDone = i < step;
            return (
              <li key={s.title} className="flex items-center gap-2 flex-1">
                <div
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors ${
                    isActive
                      ? "bg-discord-accent text-white shadow-sm shadow-discord-accent/20"
                      : isDone
                        ? "bg-green-900/40 text-green-300"
                        : "bg-discord-bg-secondary text-discord-text-muted"
                  }`}
                >
                  {isDone ? <Check size={14} /> : <Icon size={14} />}
                  {s.title}
                </div>
                {i < steps.length - 1 && (
                  <ChevronRight size={14} className="text-discord-text-muted shrink-0" />
                )}
              </li>
            );
          })}
        </ol>

        <div className="p-6 bg-discord-bg-secondary border border-discord-divider rounded-lg">
          {step === 0 && (
            <div className="space-y-4">
              <p className="text-discord-text">
                This wizard will get you from zero to your first AI-planned server configuration in
                a few minutes. You'll:
              </p>
              <ol className="list-decimal pl-6 text-discord-text space-y-1">
                <li>Invite the planning bot to a Discord server you administer</li>
                <li>Pick the guild you want to configure</li>
                <li>Describe what you want in plain language — the bot drafts a plan</li>
                <li>Review, revise, and approve</li>
              </ol>
              <button
                onClick={() => setStep(1)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-discord-accent hover:bg-discord-accent-hover text-white rounded-md text-sm font-medium transition-colors shadow-sm shadow-discord-accent/20"
              >
                Get started <ArrowRight size={14} />
              </button>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <p className="text-discord-text">
                The planning bot needs Administrator permission on your server so it can create,
                edit, and remove channels, roles, and members.
              </p>
              {inviteUrl ? (
                <a
                  href={inviteUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-discord-accent hover:bg-discord-accent-hover text-white rounded-md text-sm font-medium transition-colors shadow-sm shadow-discord-accent/20"
                >
                  <Bot size={14} /> Open invite in Discord
                </a>
              ) : (
                <div className="text-discord-text-muted text-sm">Loading invite link…</div>
              )}
              {botStatus && (
                <div className="text-discord-text-muted text-xs">
                  Bot is {botStatus.isReady ? "online" : "offline"} · currently in{" "}
                  {botStatus.guildCount} guild{botStatus.guildCount === 1 ? "" : "s"}
                </div>
              )}
              <div className="text-discord-text-muted text-xs">
                After accepting the invite, return here and continue.
              </div>
              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={() => setStep(0)}
                  className="px-3 py-2 bg-discord-bg-tertiary border border-discord-divider hover:bg-discord-channel-hover hover:text-discord-text text-discord-text-muted rounded-md text-sm transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={() => setStep(2)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-discord-accent hover:bg-discord-accent-hover text-white rounded-md text-sm font-medium transition-colors shadow-sm shadow-discord-accent/20"
                >
                  Continue <ArrowRight size={14} />
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <p className="text-discord-text">
                Pick a guild to start planning. You can switch later from the dashboard.
              </p>
              {guildsLoading ? (
                <div className="text-discord-text-muted text-sm">Loading guilds…</div>
              ) : guilds.length === 0 ? (
                <div className="p-3 bg-discord-bg-tertiary border border-dashed border-discord-divider rounded text-discord-text-muted text-sm">
                  No guilds available yet. Make sure you've invited the bot and that you have
                  Administrator permission on at least one server.
                </div>
              ) : (
                <ul className="space-y-1">
                  {guilds.map((g) => {
                    const picked = pickedGuildId === g.id;
                    return (
                      <li key={g.id}>
                        <button
                          onClick={() => setPickedGuildId(g.id)}
                          className={`group w-full flex items-center gap-3 px-4 py-3 border rounded-lg text-left transition-colors ${
                            picked
                              ? "bg-discord-accent/20 border-discord-accent"
                              : "bg-discord-bg-tertiary border-discord-divider hover:bg-discord-channel-hover hover:border-discord-text-subtle/30"
                          }`}
                        >
                          {g.icon ? (
                            <img src={g.icon} alt="" className="w-8 h-8 rounded-full" />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-discord-bg flex items-center justify-center text-discord-text font-semibold">
                              {g.name[0]?.toUpperCase() ?? "?"}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="text-discord-text font-medium truncate">{g.name}</div>
                            <div className="text-discord-text-muted text-xs">
                              {g.memberCount} members
                            </div>
                          </div>
                          {picked && <Check size={16} className="text-discord-accent" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={() => setStep(1)}
                  className="px-3 py-2 bg-discord-bg-tertiary border border-discord-divider hover:bg-discord-channel-hover hover:text-discord-text text-discord-text-muted rounded-md text-sm transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={() => pickedGuildId && navigate(`/studio/${pickedGuildId}`)}
                  disabled={!pickedGuildId}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-discord-accent hover:bg-discord-accent-hover disabled:bg-discord-bg-tertiary disabled:cursor-not-allowed text-white rounded-md text-sm font-medium transition-colors shadow-sm shadow-discord-accent/20"
                >
                  Open Studio <ArrowRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="text-center">
          <Link
            to="/dashboard"
            className="text-discord-text-muted hover:text-discord-text text-xs transition-colors"
          >
            Skip setup, go to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
