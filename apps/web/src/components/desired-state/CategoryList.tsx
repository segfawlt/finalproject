import { Plus } from "lucide-react";
import type { ChannelBase, DiffStatus } from "./types";
import CategoryItem from "./CategoryItem";

interface CategoryListProps {
  categories: ChannelBase[];
  /** Optional diff map keyed by category id. */
  diffs?: Map<string, DiffStatus>;
  /** Fallback diff status for items not present in `diffs`. */
  defaultDiffStatus?: DiffStatus;
  editing?: boolean;
  onChange?: (id: string, next: ChannelBase) => void;
  onDelete?: (id: string) => void;
  onAdd?: () => void;
}

export default function CategoryList({
  categories,
  diffs,
  defaultDiffStatus,
  editing,
  onChange,
  onDelete,
  onAdd,
}: CategoryListProps) {
  if (categories.length === 0 && !editing) {
    return <div className="text-gray-500 text-xs italic">No categories</div>;
  }
  return (
    <div className="space-y-1">
      {editing && onAdd && (
        <button
          type="button"
          onClick={onAdd}
          className="w-full flex items-center justify-center gap-1 px-3 py-1.5 border border-dashed border-shell-border rounded text-xs text-shell-text-muted hover:text-shell-text hover:border-shell-accent transition"
        >
          <Plus size={12} /> Add category
        </button>
      )}
      {categories.length > 0 && (
        <ul className="space-y-1">
          {categories.map((c) => (
            <CategoryItem
              key={c.id}
              channel={c}
              diffStatus={diffs?.get(c.id) ?? defaultDiffStatus}
              editing={editing}
              onChange={onChange ? (next) => onChange(c.id, next) : undefined}
              onDelete={onDelete ? () => onDelete(c.id) : undefined}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
