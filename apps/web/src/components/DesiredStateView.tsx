import { useMemo } from "react";
import type {
  DesiredState,
  ChannelBase,
  ServerState,
  Role,
  MemberRoleAssignment,
} from "./desired-state/types";
import { CATEGORY_TYPE } from "./desired-state/types";
import { computeFullDiff, summarizeFullDiff } from "./desired-state/diff-utils";
import { CategoryList, ChannelList, RoleList, MemberList, TombstoneList } from "./desired-state";

interface DesiredStateViewProps {
  desiredState: DesiredState | null;
  /**
   * Current Discord state for the same guild. When provided, the view shows
   * a "new / modified / removed" badge on each item and a "Will be removed"
   * section at the bottom for resources present on Discord but absent from
   * the desired state. When omitted, items render with no diff badges.
   */
  currentState?: ServerState | null;
  /**
   * When true, render the working copy as editable inputs and suppress the
   * "Will be removed" section (which compares against the current Discord
   * state — not meaningful for a draft the user is still building).
   */
  editing?: boolean;
  showMembers?: boolean;
  showTombstones?: boolean;
  onChannelChange?: (id: string, next: ChannelBase) => void;
  onChannelDelete?: (id: string) => void;
  onChannelAdd?: () => void;
  onCategoryChange?: (id: string, next: ChannelBase) => void;
  onCategoryDelete?: (id: string) => void;
  onCategoryAdd?: () => void;
  onRoleChange?: (id: string, next: Role) => void;
  onRoleDelete?: (id: string) => void;
  onRoleAdd?: () => void;
}

/**
 * Renders the planner's DesiredState as a structured tree grouped by type.
 * Optionally overlays a diff against the live Discord state to highlight
 * create / edit / delete operations the next plan will perform.
 *
 * Pure: no fetches, no modals. The Studio route supplies both states.
 */
export default function DesiredStateView({
  desiredState,
  currentState,
  editing,
  showMembers = true,
  showTombstones = true,
  onChannelChange,
  onChannelDelete,
  onChannelAdd,
  onCategoryChange,
  onCategoryDelete,
  onCategoryAdd,
  onRoleChange,
  onRoleDelete,
  onRoleAdd,
}: DesiredStateViewProps) {
  const { categories, channels, categoryNames, roleNames } = useMemo(() => {
    const allChannels: ChannelBase[] = Object.values(desiredState?.active.channels ?? {});
    const categories = allChannels.filter((c) => c.type === CATEGORY_TYPE);
    const channels = allChannels.filter((c) => c.type !== CATEGORY_TYPE);

    const categoryNames: Record<string, string> = {};
    for (const c of categories) categoryNames[c.id] = c.name;

    const roleNames: Record<string, string> = {};
    for (const r of Object.values(desiredState?.active.roles ?? {})) {
      roleNames[r.id] = r.name;
    }

    return { categories, channels, categoryNames, roleNames };
  }, [desiredState]);

  const roles = useMemo(() => Object.values(desiredState?.active.roles ?? {}), [desiredState]);
  const memberAssignments = useMemo(
    () => Object.values(desiredState?.active.memberRoles ?? {}),
    [desiredState]
  ) as MemberRoleAssignment[];
  const tombstones = desiredState?.tombstones ?? [];

  const diff = useMemo(
    () =>
      computeFullDiff(
        desiredState?.active ?? { channels: {}, roles: {}, overwrites: {} },
        currentState ?? null,
        tombstones
      ),
    [desiredState, currentState, tombstones]
  );

  if (!desiredState) {
    return (
      <div className="text-shell-text-muted text-sm italic p-4 border border-dashed border-shell-border rounded">
        No desired state yet. Submit a prompt to start planning.
      </div>
    );
  }

  // Split channels into real-id vs symbol-id to look up diffs correctly.
  // Symbol-keyed items never have a "modified" status — they're either new
  // (always) or they wouldn't be in the desired state.
  const categoryDiffs = diff?.channels.byKey;
  const channelDiffs = diff?.channels.byKey;
  const roleDiffs = diff?.roles.byKey;
  const memberDiffs = diff?.memberRoles.byKey;

  const removedCategories = diff?.channels.removed.filter((c) => c.type === CATEGORY_TYPE) ?? [];
  const removedChannels = diff?.channels.removed.filter((c) => c.type !== CATEGORY_TYPE) ?? [];
  const removedRoles = diff?.roles.removed ?? [];
  const removedMembers = diff?.memberRoles.removed ?? [];

  const hasRemoved =
    removedCategories.length > 0 ||
    removedChannels.length > 0 ||
    removedRoles.length > 0 ||
    (showMembers && removedMembers.length > 0);
  const summary = summarizeFullDiff(diff);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-shell-text font-semibold mb-2 text-sm uppercase tracking-wide">
          {desiredState.guildName}{" "}
          <span className="text-shell-text-muted font-normal normal-case">
            v{desiredState.version}
          </span>
          {editing && (
            <span className="ml-2 text-warning text-xs uppercase tracking-wide">editing</span>
          )}
        </h2>
        {currentState && <ChangeSummary summary={summary} version={desiredState.version} />}
      </div>

      <Section title="Categories" count={categories.length}>
        <CategoryList
          categories={categories}
          diffs={categoryDiffs}
          diffVersion={desiredState.version}
          editing={editing}
          onChange={onCategoryChange}
          onDelete={onCategoryDelete}
          onAdd={onCategoryAdd}
        />
      </Section>

      <Section title="Channels" count={channels.length}>
        <ChannelList
          channels={channels}
          categoryNames={categoryNames}
          diffs={channelDiffs}
          diffVersion={desiredState.version}
          editing={editing}
          onChange={onChannelChange}
          onDelete={onChannelDelete}
          onAdd={onChannelAdd}
        />
      </Section>

      <Section title="Roles" count={roles.length}>
        <RoleList
          roles={roles}
          diffs={roleDiffs}
          diffVersion={desiredState.version}
          editing={editing}
          onChange={onRoleChange}
          onDelete={onRoleDelete}
          onAdd={onRoleAdd}
        />
      </Section>

      {showMembers && (
        <Section title="Members" count={memberAssignments.length}>
          <MemberList
            assignments={memberAssignments}
            roleNames={roleNames}
            diffs={memberDiffs}
            diffVersion={desiredState.version}
            editing={editing}
          />
        </Section>
      )}

      {hasRemoved && !editing && (
        <Section
          title="Will be removed"
          count={removedItemsCount(
            removedCategories,
            removedChannels,
            removedRoles,
            removedMembers
          )}
          tone="danger"
        >
          {removedCategories.length > 0 && (
            <div className="mb-3">
              <div className="text-xs text-shell-text-muted mb-1">Categories</div>
              <CategoryList
                categories={removedCategories}
                defaultDiffStatus="removed"
                diffVersion={desiredState.version}
              />
            </div>
          )}
          {removedChannels.length > 0 && (
            <div className="mb-3">
              <div className="text-xs text-shell-text-muted mb-1">Channels</div>
              <ChannelList
                channels={removedChannels}
                categoryNames={categoryNames}
                defaultDiffStatus="removed"
                diffVersion={desiredState.version}
              />
            </div>
          )}
          {removedRoles.length > 0 && (
            <div className="mb-3">
              <div className="text-xs text-shell-text-muted mb-1">Roles</div>
              <RoleList
                roles={removedRoles}
                defaultDiffStatus="removed"
                diffVersion={desiredState.version}
              />
            </div>
          )}
          {showMembers && removedMembers.length > 0 && (
            <div>
              <div className="text-xs text-shell-text-muted mb-1">Members</div>
              <MemberList
                assignments={removedMembers}
                roleNames={roleNames}
                defaultDiffStatus="removed"
                diffVersion={desiredState.version}
              />
            </div>
          )}
        </Section>
      )}

      {showTombstones && tombstones.length > 0 && !editing && (
        <Section title="Already removed" count={tombstones.length} tone="danger">
          <TombstoneList tombstones={tombstones} />
        </Section>
      )}
    </div>
  );
}

function ChangeSummary({
  summary,
  version,
}: {
  summary: { added: number; modified: number; removed: number };
  version: number;
}) {
  if (summary.added === 0 && summary.modified === 0 && summary.removed === 0) {
    return (
      <div className="mt-3 text-xs text-shell-text-muted">
        No changes from the current server state.
      </div>
    );
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs" aria-label="Planned changes">
      <span className="text-shell-text-muted uppercase tracking-wide">Changes in v{version}</span>
      {summary.added > 0 && (
        <span className="rounded border border-green-700/50 bg-green-900/30 px-2 py-1 text-green-300">
          +{summary.added} added
        </span>
      )}
      {summary.modified > 0 && (
        <span className="rounded border border-yellow-700/50 bg-yellow-900/30 px-2 py-1 text-yellow-200">
          {summary.modified} modified
        </span>
      )}
      {summary.removed > 0 && (
        <span className="rounded border border-red-700/50 bg-red-900/30 px-2 py-1 text-red-300">
          -{summary.removed} deleted
        </span>
      )}
    </div>
  );
}

function removedItemsCount(
  cats: unknown[],
  channels: unknown[],
  roles: unknown[],
  members: unknown[]
): number {
  return cats.length + channels.length + roles.length + members.length;
}

function Section({
  title,
  count,
  tone = "default",
  children,
}: {
  title: string;
  count: number;
  tone?: "default" | "danger";
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3
        className={`text-xs uppercase tracking-wide font-semibold mb-2 ${
          tone === "danger" ? "text-error" : "text-shell-text-muted"
        }`}
      >
        {title} <span className="text-shell-text-muted/60">({count})</span>
      </h3>
      {children}
    </section>
  );
}
