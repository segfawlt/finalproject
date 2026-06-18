import { Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "./stores/authStore";
import { useEffect } from "react";
import Login from "./routes/Login";
import Studio from "./routes/Studio";
import Dashboard from "./routes/Dashboard";
import Setup from "./routes/Setup";
import Templates from "./routes/Templates";
import TemplateEditor from "./routes/TemplateEditor";
import NotFound from "./routes/NotFound";
import AppLayout from "./components/AppLayout";

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
      <Route element={isAuthenticated ? <AppLayout /> : <Navigate to="/login" replace />}>
        <Route path="/studio" element={<Studio />} />
        <Route path="/studio/:guildId" element={<Studio />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/dashboard/:guildId" element={<Dashboard />} />
        <Route path="/setup" element={<Setup />} />
        <Route path="/setup/:guildId" element={<Setup />} />
        <Route path="/templates" element={<Navigate to="/dashboard" replace />} />
        <Route path="/templates/:guildId" element={<Templates />} />
        <Route path="/templates/:guildId/:templateId" element={<TemplateEditor />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default App;
