import { useParams } from "react-router-dom";

export default function Setup() {
  const { guildId } = useParams<{ guildId: string }>();

  return (
    <div className="min-h-screen bg-discord-bg-tertiary">
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-discord-text">Setup Wizard</h1>
          <p className="mt-2 text-discord-text-muted">
            {guildId ? `Setting up guild: ${guildId}` : "First-time setup"}
          </p>
          <p className="mt-4 text-sm text-discord-text-muted">
            Guided server configuration — coming soon
          </p>
        </div>
      </div>
    </div>
  );
}
