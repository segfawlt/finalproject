import { useState } from "react";
import { Sparkles, ArrowRight } from "lucide-react";

/**
 * Curated starting points shown in the chat's empty state. Each
 * prompt is concrete enough for the LLM to act on without further
 * clarification in most cases. Kept in module scope so the welcome
 * screen stays a pure component and the list is easy to evolve.
 */
export const WELCOME_PROMPTS: ReadonlyArray<{
  title: string;
  description: string;
  prompt: string;
}> = [
  {
    title: "Set up staff channels",
    description: "Private staff space with a moderator role",
    prompt:
      "Set up a private staff category with #staff-chat and #mod-logs channels, and create a Moderator role that can manage messages and channels in that category.",
  },
  {
    title: "Gaming community layout",
    description: "Categories and channels for a gaming server",
    prompt:
      "Create a gaming community layout with categories for General, LFG, Tournaments, and Voice Lounges, plus roles for Members, VIP, and Verified.",
  },
  {
    title: "Foundational roles",
    description: "Base roles with sensible permissions",
    prompt:
      "Set up foundational roles: Member, VIP, Moderator, and Admin. Make sure @everyone has View Channels but limited Send Messages access in staff-only channels.",
  },
  {
    title: "Channel permission fix",
    description: "Configure overwrites for a specific channel",
    prompt:
      "I need help configuring permission overwrites for a specific channel. Ask me which channel first, then suggest the right access setup.",
  },
  {
    title: "Audit and cleanup",
    description: "Review existing channels and suggest cleanup",
    prompt:
      "Audit my current server layout and tell me which channels are empty, unused, or could be consolidated.",
  },
];

interface WelcomeScreenProps {
  guildName: string;
  onPromptSelect: (prompt: string) => void;
  disabled?: boolean;
}

export default function WelcomeScreen({
  guildName,
  onPromptSelect,
  disabled = false,
}: WelcomeScreenProps) {
  const [customPrompt, setCustomPrompt] = useState("");

  function handleCustomSubmit() {
    const trimmed = customPrompt.trim();
    if (!trimmed) return;
    onPromptSelect(trimmed);
  }

  return (
    <div className="max-w-2xl mx-auto py-8 space-y-8">
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-shell-text-muted">
          <Sparkles size={14} className="text-agent-thinking" />
          <span className="text-xs uppercase tracking-wider font-semibold">Welcome</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-shell-text">
          Configure {guildName}
        </h1>
        <p className="text-shell-text-muted text-sm leading-relaxed">
          Pick a starting point, or describe what you want changed. The AI
          will plan the changes, you approve, then they go live.
        </p>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-wider font-semibold text-shell-text-subtle mb-3">
          Suggestions
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {WELCOME_PROMPTS.map((p) => (
            <button
              key={p.title}
              onClick={() => onPromptSelect(p.prompt)}
              disabled={disabled}
              className="text-left p-4 bg-shell-surface border border-shell-border rounded-lg hover:border-shell-border-strong hover:bg-shell-surface2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors group"
            >
              <div className="text-shell-text font-medium text-sm mb-1">{p.title}</div>
              <div className="text-shell-text-muted text-xs leading-relaxed">
                {p.description}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-wider font-semibold text-shell-text-subtle mb-3">
          Or describe what you want
        </div>
        <textarea
          value={customPrompt}
          onChange={(e) => setCustomPrompt(e.target.value)}
          placeholder="e.g., Create a staff channel and a moderator role..."
          rows={3}
          disabled={disabled}
          className="w-full p-3 rounded bg-shell-surface text-shell-text border border-shell-border focus:border-shell-accent focus:outline-none focus:ring-1 focus:ring-shell-accent/30 disabled:opacity-50 text-sm transition-colors resize-none"
        />
        <button
          onClick={handleCustomSubmit}
          disabled={disabled || !customPrompt.trim()}
          className="mt-2 inline-flex items-center gap-2 px-4 py-2 bg-shell-accent text-shell-accent-fg rounded text-sm font-medium hover:bg-shell-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Create & Plan
          <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}
