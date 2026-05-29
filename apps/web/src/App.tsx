import { Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "./stores/authStore";
import { useEffect } from "react";
import Login from "./routes/Login";
import Studio from "./routes/Studio";
import Dashboard from "./routes/Dashboard";
import Setup from "./routes/Setup";
import NotFound from "./routes/NotFound";

function App() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isLoading = useAuthStore((state) => state.isLoading);
  const checkSession = useAuthStore((state) => state.checkSession);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-discord-bg flex items-center justify-center">
        <div className="animate-pulse text-discord-text-muted">Loading...</div>
      </div>
    );
  }

  return (
    <Routes>
      <Route
        path="/"
        element={
          isAuthenticated ? <Navigate to="/studio" replace /> : <Navigate to="/login" replace />
        }
      />
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to="/studio" replace /> : <Login />}
      />
      <Route
        path="/studio"
        element={isAuthenticated ? <Studio /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/studio/:guildId"
        element={isAuthenticated ? <Studio /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/dashboard"
        element={isAuthenticated ? <Dashboard /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/dashboard/:guildId"
        element={isAuthenticated ? <Dashboard /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/setup"
        element={isAuthenticated ? <Setup /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/setup/:guildId"
        element={isAuthenticated ? <Setup /> : <Navigate to="/login" replace />}
      />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default App;
