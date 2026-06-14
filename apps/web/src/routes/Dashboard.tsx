import { useParams } from "react-router-dom";
import { useDashboardStore } from "../stores/dashboardStore";
import { useEffect } from "react";

export default function Dashboard() {
  const { guildId } = useParams<{ guildId: string }>();
  const setSelectedGuild = useDashboardStore((state) => state.setSelectedGuild);

  useEffect(() => {
    setSelectedGuild(guildId ?? null);
  }, [guildId, setSelectedGuild]);

  return (
    <div className="min-h-screen bg-discord-bg-secondary">
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-discord-text">Dashboard</h1>
          <p className="mt-2 text-discord-text-muted">
            {guildId ? `Guild: ${guildId}` : "Select a guild to view"}
          </p>
          <p className="mt-4 text-sm text-discord-text-muted">
            Plan history, rules, settings — coming soon
          </p>
        </div>
      </div>
    </div>
  );
}
