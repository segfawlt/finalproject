import { useAuthStore } from "../stores/authStore";

export default function Login() {
  const login = useAuthStore((state) => state.login);

  return (
    <div className="min-h-screen bg-discord-bg">
      <div className="flex items-center justify-center h-screen">
        <div className="text-center max-w-md">
          <h1 className="text-4xl font-bold text-discord-text mb-4">Discord Platform</h1>
          <p className="text-discord-text-muted mb-8">
            AI-driven Discord server management. Configure your server with natural language.
          </p>
          <button
            onClick={login}
            className="px-8 py-3 bg-discord-accent hover:bg-discord-accent-hover text-white rounded font-medium transition-colors"
          >
            Login with Discord
          </button>
        </div>
      </div>
    </div>
  );
}
