import { useParams } from "react-router-dom";
import { useStudioStore } from "../stores/studioStore";
import { useEffect } from "react";

export default function Studio() {
  const { guildId } = useParams<{ guildId: string }>();
  const setSelectedGuild = useStudioStore((state) => state.setSelectedGuild);

  useEffect(() => {
    if (guildId) {
      setSelectedGuild(guildId);
    }
  }, [guildId, setSelectedGuild]);

  return (
    <div className="min-h-screen bg-discord-bg">
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-discord-text">Studio</h1>
          <p className="mt-2 text-discord-text-muted">
            {guildId ? `Guild: ${guildId}` : "Select a guild to begin"}
          </p>
          <p className="mt-4 text-sm text-discord-text-muted">
            Discord clone configuration UI — coming soon
          </p>
        </div>
      </div>
    </div>
  );
}
