import { useEffect, useState } from "react";
import { Loader } from "lucide-react";
import { useStudioStore, makeTab } from "../../stores/studioStore";
import { apiFetch } from "../../lib/api";
import type { UseConversationResult } from "../../hooks/useConversation";
import type { ChannelBase, PermissionOverwrite, Role, ServerState } from "../desired-state/types";
import { CATEGORY_TYPE } from "../desired-state/types";
import TabPanel, { type AddOption } from "./TabPanel";
import ServerTab from "./ServerTab";
import DesiredTab from "./DesiredTab";
import ChannelDetail from "./ChannelDetail";
import RolesTab from "./RolesTab";
import MembersTab from "./MembersTab";
import TemplatesTab from "./TemplatesTab";

interface RightPanelProps {
  c: UseConversationResult;
  guildId: string;
}

/**
 * Right column of the Studio: VSCode-style tab bar on top, tab
 * content below. Owns the right panel's own current-state fetch
 * (so the channel detail can render without depending on the
 * conversation lifecycle's state copy).
 */
export default function RightPanel({ c, guildId }: RightPanelProps) {
  const openTabs = useStudioStore((s) => s.openTabs);
  const activeTab = useStudioStore((s) => s.activeTab);
  const switchTab = useStudioStore((s) => s.switchTab);
  const closeTab = useStudioStore((s) => s.closeTab);
  const openTab = useStudioStore((s) => s.openTab);

  // Right panel's own snapshot of the current Discord state. Used
  // for the Server tab display AND the channel detail tab.
  const [serverState, setServerState] = useState<ServerState | null>(null);
  const [serverLoading, setServerLoading] = useState(true);
  const [serverError, setServerError] = useState("");

  useEffect(() => {
    if (!guildId) return;
    let cancelled = false;
    setServerLoading(true);
    setServerError("");
    apiFetch(`/api/guilds/${guildId}/state`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: ServerState | null) => {
        if (cancelled) return;
        setServerState(data);
        setServerLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setServerError(err instanceof Error ? err.message : String(err));
        setServerLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [guildId]);

  const addOptions: AddOption[] = [
    { type: "roles", label: "Roles" },
    { type: "members", label: "Members" },
    { type: "templates", label: "Templates" },
  ];

  function handleAdd(type: AddOption["type"]) {
    openTab(makeTab(type));
  }

  function handleChannelClick(channel: ChannelBase) {
    openTab(makeTab("channel", { channelId: channel.id }));
  }

  // Resolve the active channel id when a channel tab is selected.
  const activeChannelId =
    activeTab && activeTab.startsWith("channel:") ? activeTab.slice("channel:".length) : null;

  const activeChannel = activeChannelId
    ? serverState?.channels.find((c) => c.id === activeChannelId)
    : null;

  const activeCategoryName = activeChannel
    ? serverState?.channels.find((c) => c.id === activeChannel.parentId && c.type === CATEGORY_TYPE)
        ?.name
    : undefined;

  return (
    <div className="flex flex-col h-full bg-black">
      <TabPanel
        tabs={openTabs}
        activeTabId={activeTab}
        onSelect={switchTab}
        onClose={closeTab}
        onAdd={handleAdd}
        addOptions={addOptions}
      />
      <div className="flex-1 overflow-y-auto">
        {activeTab === "server" && (
          <ServerTab
            state={serverState}
            loading={serverLoading}
            error={serverError}
            onChannelClick={serverState ? handleChannelClick : undefined}
          />
        )}
        {activeTab === "desired" && (
          <DesiredTab desiredState={c.desiredState} currentState={c.currentState} />
        )}
        {activeTab === "roles" && <RolesTab guildId={guildId} />}
        {activeTab === "members" && <MembersTab guildId={guildId} />}
        {activeTab === "templates" && (
          <TemplatesTab
            guildId={guildId}
            conversationId={c.conversationId}
            activeTemplates={c.activeTemplates}
            onActiveTemplatesChange={c.setActiveTemplates}
          />
        )}
        {activeChannelId && (
          <ChannelDetailContent
            loading={serverLoading}
            error={serverError}
            channel={activeChannel ?? null}
            overwrites={serverState?.overwrites ?? []}
            roles={serverState?.roles ?? []}
            categoryName={activeCategoryName}
          />
        )}
        {!activeTab ||
          (activeTab !== "server" &&
            activeTab !== "desired" &&
            activeTab !== "roles" &&
            activeTab !== "members" &&
            activeTab !== "templates" &&
            !activeChannelId && (
              <div className="p-4 text-shell-text-muted text-sm">
                Select a tab above to view its contents.
              </div>
            ))}
      </div>
    </div>
  );
}

function ChannelDetailContent({
  loading,
  error,
  channel,
  overwrites,
  roles,
  categoryName,
}: {
  loading: boolean;
  error: string;
  channel: ChannelBase | null;
  overwrites: PermissionOverwrite[];
  roles: Role[];
  categoryName: string | undefined;
}) {
  if (loading) {
    return (
      <div className="p-4 text-shell-text-muted text-xs flex items-center gap-2">
        <Loader size={12} className="animate-spin" />
        Loading channel…
      </div>
    );
  }
  if (error) {
    return <div className="p-4 text-error text-sm">{error}</div>;
  }
  if (!channel) {
    return (
      <div className="p-4 text-shell-text-muted text-sm">
        Channel not found in the current state. It may have been removed.
      </div>
    );
  }
  return (
    <ChannelDetail
      channel={channel}
      overwrites={overwrites}
      roles={roles}
      categoryName={categoryName}
    />
  );
}
