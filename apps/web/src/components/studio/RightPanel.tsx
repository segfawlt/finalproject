import { useStudioStore } from "../../stores/studioStore";
import type { UseConversationResult } from "../../hooks/useConversation";
import TabPanel from "./TabPanel";
import ServerTab from "./ServerTab";
import DesiredTab from "./DesiredTab";

interface RightPanelProps {
  c: UseConversationResult;
  guildId: string;
}

/**
 * Right column of the Studio: VSCode-style tab bar on top,
 * tab content below. Owns the persistent tabs (Server, Desired)
 * out of the box; closable tabs (channel detail, roles, members,
 * templates, drift) are added in subsequent phases.
 */
export default function RightPanel({ c, guildId }: RightPanelProps) {
  const openTabs = useStudioStore((s) => s.openTabs);
  const activeTab = useStudioStore((s) => s.activeTab);
  const switchTab = useStudioStore((s) => s.switchTab);
  const closeTab = useStudioStore((s) => s.closeTab);

  return (
    <div className="flex flex-col h-full bg-shell-surface">
      <TabPanel
        tabs={openTabs}
        activeTabId={activeTab}
        onSelect={switchTab}
        onClose={closeTab}
      />
      <div className="flex-1 overflow-y-auto">
        {activeTab === "server" && <ServerTab guildId={guildId} />}
        {activeTab === "desired" && (
          <DesiredTab
            desiredState={c.desiredState}
            currentState={c.currentState}
          />
        )}
        {activeTab !== "server" && activeTab !== "desired" && (
          <div className="p-4 text-shell-text-muted text-sm">
            This tab is not yet wired up. It will be added in a later phase.
          </div>
        )}
      </div>
    </div>
  );
}
