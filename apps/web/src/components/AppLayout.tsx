import { Outlet } from "react-router-dom";

export default function AppLayout() {
  return (
    <div className="h-screen overflow-hidden flex flex-col bg-shell-canvas">
      <div className="flex-1 flex flex-col min-h-0">
        <Outlet />
      </div>
    </div>
  );
}
