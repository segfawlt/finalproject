import { Loader } from "lucide-react";
import { CATEGORY_TYPE, type ServerState, type ChannelBase } from "../desired-state/types";
import {
  CategoryList,
  ChannelList,
  RoleList,
  MemberList,
} from "../desired-state";

interface ServerTabProps {
  /** Pre-fetched current Discord state. Required — RightPanel owns the fetch
   *  so the same data can be shared with the channel detail tab. */
  state: ServerState | null;
  loading?: boolean;
  error?: string;
  /** Called when the user clicks a channel — opens the channel detail tab. */
  onChannelClick?: (channel: ChannelBase) => void;
}

/**
 * Read-only view of the current Discord state for the active guild.
 * Renders categories / channels / roles / members without diff badges
 * — 'this is your server right now', as opposed to the Desired tab
 * which is 'what we're about to change it to'.
 */
export default function ServerTab({
  state,
  loading = false,
  error = "",
  onChannelClick,
}: ServerTabProps) {
  if (loading) {
    return (
      <Panel>
        <div className="flex items-center gap-2 text-shell-text-muted text-xs">
          <Loader size={12} className="animate-spin" />
          Loading server state…
        </div>
      </Panel>
    );
  }

  if (error) {
    return (
      <Panel>
        <div className="text-error text-sm">{error}</div>
      </Panel>
    );
  }

  if (!state) {
    return (
      <Panel>
        <div className="text-shell-text-muted text-sm">No server state available.</div>
      </Panel>
    );
  }

  const categories = state.channels.filter((c) => c.type === CATEGORY_TYPE);
  const channels = state.channels.filter((c) => c.type !== CATEGORY_TYPE);
  const roleNames: Record<string, string> = {};
  for (const r of state.roles) roleNames[r.id] = r.name;
  const categoryNames: Record<string, string> = {};
  for (const c of categories) categoryNames[c.id] = c.name;
  const memberAssignments = state.memberRoles ?? [];

  return (
    <Panel>
      <header className="mb-3">
        <h2 className="text-shell-text font-semibold text-sm">{state.guildName}</h2>
        <p className="text-shell-text-muted text-xs">
          {state.memberCount} members · current Discord state
        </p>
      </header>

      <Section title="Categories" count={categories.length}>
        <CategoryList categories={categories} />
      </Section>

      <Section title="Channels" count={channels.length}>
        <ChannelList
          channels={channels}
          categoryNames={categoryNames}
          onClick={onChannelClick}
        />
      </Section>

      <Section title="Roles" count={state.roles.length}>
        <RoleList roles={state.roles} />
      </Section>

      {memberAssignments.length > 0 && (
        <Section title="Members" count={memberAssignments.length}>
          <MemberList assignments={memberAssignments} roleNames={roleNames} />
        </Section>
      )}
    </Panel>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="p-4 space-y-4">{children}</div>;
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="text-[10px] uppercase tracking-wider font-semibold text-shell-text-subtle mb-2">
        {title} <span className="text-shell-text-subtle/60">({count})</span>
      </h3>
      {children}
    </section>
  );
}
