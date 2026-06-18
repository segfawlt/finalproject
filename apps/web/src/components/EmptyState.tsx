import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export default function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-6 py-10 rounded-lg border border-dashed border-discord-divider bg-gradient-to-b from-discord-bg-secondary/40 to-transparent">
      <div className="relative mb-4">
        <div className="absolute inset-0 rounded-full bg-discord-accent/20 blur-xl" aria-hidden />
        <div className="relative w-14 h-14 rounded-full bg-discord-bg-tertiary border border-discord-divider flex items-center justify-center">
          <Icon size={22} className="text-discord-text-muted" strokeWidth={1.5} />
        </div>
      </div>
      <h3 className="text-discord-text font-medium text-sm">{title}</h3>
      {description && (
        <p className="text-discord-text-muted text-xs mt-1.5 max-w-xs leading-relaxed">
          {description}
        </p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          className="mt-4 inline-flex items-center gap-1.5 px-4 py-1.5 bg-discord-accent hover:bg-discord-accent-hover text-white rounded text-xs font-medium transition-colors"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
