import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-discord-bg">
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <h1 className="text-6xl font-bold text-discord-accent">404</h1>
          <p className="mt-4 text-xl text-discord-text">Page not found</p>
          <Link
            to="/studio"
            className="mt-6 inline-block px-6 py-2 bg-discord-accent hover:bg-discord-accent-hover text-white rounded transition-colors"
          >
            Go to Studio
          </Link>
        </div>
      </div>
    </div>
  );
}
