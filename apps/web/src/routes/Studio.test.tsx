// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Studio from "./Studio";

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));
const { authState } = vi.hoisted(() => ({
  authState: { user: { name: "Ada" } as { name: string } | null },
}));

vi.mock("../lib/api", () => ({ apiFetch }));
vi.mock("../hooks/useGuildName", () => ({ useGuildName: () => null }));
vi.mock("../hooks/useConversation", () => ({
  useConversation: () => ({
    iterations: [],
    showTemplatePanel: false,
    activeTemplates: [],
    conversationId: null,
    loadConversation: vi.fn(),
    reset: vi.fn(),
  }),
}));
vi.mock("../hooks/useDesiredStateEdit", () => ({
  useDesiredStateEdit: () => ({
    editing: false,
    editableState: null,
    patchChannel: vi.fn(),
    deleteChannel: vi.fn(),
    addChannel: vi.fn(),
    addCategory: vi.fn(),
    patchRole: vi.fn(),
    deleteRole: vi.fn(),
    addRole: vi.fn(),
    beginEdit: vi.fn(),
    finishEdit: vi.fn(),
    cancelEdit: vi.fn(),
  }),
}));
vi.mock("../hooks/useGuildDrift", () => ({
  useGuildDrift: () => ({ event: null, dismiss: vi.fn() }),
}));
vi.mock("../stores/studioStore", () => ({
  useStudioStore: (selector: (state: { setSelectedGuild: () => void }) => unknown) =>
    selector({ setSelectedGuild: vi.fn() }),
}));
vi.mock("../stores/authStore", () => ({
  useAuthStore: (selector: (state: { user: { name: string } | null }) => unknown) =>
    selector(authState),
}));
vi.mock("../components/studio/StudioShell", () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="studio-shell">{children}</div>
  ),
}));
vi.mock("../components/studio/StudioHeader", () => ({ default: () => <div /> }));
vi.mock("../components/studio/WorkspaceSidebar", () => ({ default: () => <div /> }));
vi.mock("../components/studio/ChatArea", () => ({ default: () => <div /> }));
vi.mock("../components/studio/RightPanel", () => ({ default: () => <div /> }));
vi.mock("../components/studio/DriftIndicator", () => ({ default: () => <div /> }));
vi.mock("../components/studio/IterationHistoryModal", () => ({ default: () => <div /> }));
vi.mock("../components/studio/SettingsDialog", () => ({ default: () => <div /> }));

describe("Studio guild picker", () => {
  beforeEach(() => {
    authState.user = { name: "Ada" };
    apiFetch.mockReset();
    apiFetch.mockImplementation((url: string) => {
      if (url === "/api/guilds") {
        return Promise.resolve(
          new Response(
            JSON.stringify([
              {
                id: "guild-1",
                name: "Design Guild",
                icon: null,
                memberCount: 42,
                latestConversation: null,
              },
            ]),
            { status: 200 }
          )
        );
      }
      return Promise.resolve(new Response(JSON.stringify({ url: "https://example.test" })));
    });
  });

  it("renders the standalone selector without Studio shell chrome", async () => {
    render(
      <MemoryRouter initialEntries={["/studio"]}>
        <Routes>
          <Route path="/studio" element={<Studio />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "Select a server" })).toBeInTheDocument();
    expect(screen.getByText("Logged in as Ada")).toBeInTheDocument();
    expect(screen.queryByText("Select a guild to plan against")).not.toBeInTheDocument();
    expect(screen.queryByTestId("studio-shell")).not.toBeInTheDocument();
  });

  it("renders Studio shell chrome for a guild route", () => {
    render(
      <MemoryRouter initialEntries={["/studio/guild-1"]}>
        <Routes>
          <Route path="/studio/:guildId" element={<Studio />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByTestId("studio-shell")).toBeInTheDocument();
  });

  it("falls back to User when the authenticated user is unavailable", async () => {
    authState.user = null;

    render(
      <MemoryRouter initialEntries={["/studio"]}>
        <Routes>
          <Route path="/studio" element={<Studio />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText("Logged in as User")).toBeInTheDocument();
    authState.user = { name: "Ada" };
  });

  it("shows the guild name and stable member fallback", async () => {
    render(
      <MemoryRouter initialEntries={["/studio"]}>
        <Routes>
          <Route path="/studio" element={<Studio />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole("link", { name: /Design Guild/ })).toBeInTheDocument();
    expect(screen.getByText("42 members")).toBeInTheDocument();
  });

  it("disables refresh while guilds are loading", async () => {
    apiFetch.mockImplementation((url: string) =>
      url === "/api/guilds"
        ? new Promise<Response>(() => {})
        : Promise.resolve(new Response(JSON.stringify({ url: "https://example.test" })))
    );

    render(
      <MemoryRouter initialEntries={["/studio"]}>
        <Routes>
          <Route path="/studio" element={<Studio />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Refresh guilds" })).toBeDisabled()
    );
  });

  it("renders an error when guild loading fails", async () => {
    apiFetch.mockImplementation((url: string) =>
      url === "/api/guilds"
        ? Promise.resolve(new Response(JSON.stringify({ error: "nope" }), { status: 503 }))
        : Promise.resolve(new Response(JSON.stringify({ url: "https://example.test" })))
    );

    render(
      <MemoryRouter initialEntries={["/studio"]}>
        <Routes>
          <Route path="/studio" element={<Studio />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText("Failed to load guilds (503)")).toBeInTheDocument();
  });

  it("renders the empty state and invite action when no guilds are available", async () => {
    apiFetch.mockImplementation((url: string) =>
      url === "/api/guilds"
        ? Promise.resolve(new Response(JSON.stringify([]), { status: 200 }))
        : Promise.resolve(new Response(JSON.stringify({ url: "https://example.test/invite" })))
    );

    render(
      <MemoryRouter initialEntries={["/studio"]}>
        <Routes>
          <Route path="/studio" element={<Studio />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText("No guilds ready yet")).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: /Invite the bot/ })).toHaveAttribute(
      "href",
      "https://example.test/invite"
    );
  });

  it("marks the clicked guild row as selecting before native navigation", async () => {
    render(
      <MemoryRouter initialEntries={["/studio"]}>
        <Routes>
          <Route path="/studio" element={<Studio />} />
        </Routes>
      </MemoryRouter>
    );

    const guildRow = await screen.findByRole("link", { name: /Design Guild/ });
    expect(guildRow).toHaveAttribute("href", "/studio/guild-1");
    expect(guildRow).toHaveAttribute("data-state", "idle");

    fireEvent.click(guildRow);

    expect(guildRow).toHaveAttribute("data-state", "selecting");
  });
});
