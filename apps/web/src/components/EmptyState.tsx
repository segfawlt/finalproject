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
    <div className="flex flex-col items-center justify-center text-center px-6 py-10 rounded-lg border border-dashed border-shell-border bg-gradient-to-b from-shell-surface2/40 to-transparent">
      <div className="relative mb-4">
        <div className="absolute inset-0 rounded-full bg-shell-accent/20 blur-xl" aria-hidden />
        <div className="relative w-14 h-14 rounded-full bg-shell-canvas border border-shell-border flex items-center justify-center">
          <Icon size={22} className="text-shell-text-muted" strokeWidth={1.5} />
        </div>
      </div>
      <h3 className="text-shell-text font-medium text-sm">{title}</h3>
      {description && (
        <p className="text-shell-text-muted text-xs mt-1.5 max-w-xs leading-relaxed">
          {description}
        </p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          className="mt-4 inline-flex items-center gap-1.5 px-4 py-1.5 bg-shell-accent hover:bg-shell-accent-hover text-shell-accent-fg rounded text-xs font-medium transition-colors"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
