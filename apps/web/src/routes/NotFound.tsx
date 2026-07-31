import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-shell-canvas">
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <h1 className="text-6xl font-bold text-shell-text">404</h1>
          <p className="mt-4 text-xl text-shell-text">Page not found</p>
          <Link
            to="/studio"
            className="mt-6 inline-block px-6 py-2 bg-shell-accent hover:bg-shell-accent-hover text-shell-accent-fg rounded transition-colors"
          >
            Go to Studio
          </Link>
        </div>
      </div>
    </div>
  );
}
