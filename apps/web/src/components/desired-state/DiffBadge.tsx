import { Plus, Pencil, Minus } from "lucide-react";
import type { DiffStatus } from "./types";

interface DiffBadgeProps {
  status: DiffStatus;
}

/**
 * Tiny colored badge indicating whether a desired-state item will be created,
 * modified, deleted, or left unchanged when the plan runs.
 */
export default function DiffBadge({ status }: DiffBadgeProps) {
  if (status === "unchanged") return null;
  const { Icon, className, label } = styleFor(status);
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wide font-medium ${className}`}
      title={label}
    >
      <Icon size={10} />
      {label}
    </span>
  );
}

function styleFor(status: DiffStatus): {
  Icon: typeof Plus;
  className: string;
  label: string;
} {
  switch (status) {
    case "new":
      return {
        Icon: Plus,
        className: "bg-green-900/50 text-green-300 border border-green-700/50",
        label: "new",
      };
    case "modified":
      return {
        Icon: Pencil,
        className: "bg-yellow-900/50 text-yellow-200 border border-yellow-700/50",
        label: "modified",
      };
    case "removed":
      return {
        Icon: Minus,
        className: "bg-red-900/50 text-red-300 border border-red-700/50",
        label: "removed",
      };
    case "unchanged":
      // unreachable
      return {
        Icon: Plus,
        className: "",
        label: "",
      };
  }
}
