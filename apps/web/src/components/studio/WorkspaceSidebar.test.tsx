// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import WorkspaceSidebar from "./WorkspaceSidebar";
import { useStudioStore } from "../../stores/studioStore";

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));

function LocationProbe() {
  return <span data-testid="location">{useLocation().pathname}</span>;
}

vi.mock("../../lib/api", () => ({ apiFetch }));

vi.mock("../../stores/authStore", () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({
      user: { name: "Ada Lovelace" },
      isAuthenticated: true,
      logout: vi.fn(),
    }),
}));

describe("WorkspaceSidebar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiFetch.mockResolvedValue({ ok: true, json: async () => [] });
  });

  it("renders workspace routes, guild identity, account access, and contextual content", async () => {
    render(
      <MemoryRouter initialEntries={["/studio/guild-1"]}>
        <WorkspaceSidebar
          guildId="guild-1"
          guildName="Design Guild"
          onNewChat={vi.fn()}
          contextTitle="Context"
        >
          <div>contextual tools</div>
        </WorkspaceSidebar>
      </MemoryRouter>
    );

    const navItems = screen.getByRole("navigation").parentElement!.querySelectorAll("a, button");
    expect([...navItems].map((item) => item.textContent?.trim())).toEqual([
      "Design Guild",
      "New chat",
      "Studio",
      "Templates",
    ]);
    expect(screen.getByRole("link", { name: "Studio" })).toHaveAttribute("href", "/studio/guild-1");
    expect(screen.getByRole("link", { name: "Templates" })).toHaveAttribute("href", "/templates");
    expect(screen.getByText("contextual tools")).toBeVisible();
    expect(screen.getByRole("link", { name: /Design Guild/ })).toHaveAttribute("href", "/studio");
    expect(screen.getByRole("button", { name: "Sign out" })).toBeVisible();
    expect(screen.queryByRole("button", { name: /ollapse conversation history/i })).toBeNull();
    expect(await screen.findByText("Recent conversations")).toBeVisible();
    expect(await screen.findByText("No conversations yet.")).toBeVisible();
  });

  it("renders template context without conversation history", () => {
    render(
      <MemoryRouter initialEntries={["/templates/one/studio"]}>
        <WorkspaceSidebar
          guildId={null}
          guildName={null}
          mode="templates"
          contextTitle="Version history"
        >
          <div>version history</div>
        </WorkspaceSidebar>
      </MemoryRouter>
    );

    expect(apiFetch).not.toHaveBeenCalled();
    expect(screen.queryByText("Recent conversations")).toBeNull();
    expect(screen.getByText("version history")).toBeVisible();
  });

  it("marks the current workspace route active", () => {
    render(
      <MemoryRouter initialEntries={["/templates"]}>
        <WorkspaceSidebar guildId={null} guildName={null} />
      </MemoryRouter>
    );

    expect(screen.getByRole("link", { name: "Templates" })).toHaveClass("bg-shell-surface3");
    expect(screen.getByRole("link", { name: "Studio" })).not.toHaveClass("bg-shell-surface3");
  });

  it("shows an explicit empty state without a selected guild", async () => {
    render(
      <MemoryRouter initialEntries={["/studio"]}>
        <WorkspaceSidebar guildId={null} guildName={null} />
      </MemoryRouter>
    );

    expect(await screen.findByText("Select a server to see conversations.")).toBeVisible();
  });

  it("starts a new chat from the server workspace", async () => {
    const onNewChat = vi.fn();
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/studio/guild-1"]}>
        <WorkspaceSidebar guildId="guild-1" guildName="Design Guild" onNewChat={onNewChat} />
      </MemoryRouter>
    );

    await user.click(screen.getByRole("button", { name: "New chat" }));
    expect(onNewChat).toHaveBeenCalledOnce();
  });

  it("navigates to the retained guild for a global workspace", async () => {
    const user = userEvent.setup();
    useStudioStore.getState().setSelectedGuild("guild-2");
    render(
      <MemoryRouter initialEntries={["/templates"]}>
        <WorkspaceSidebar guildId={null} guildName={null} />
        <LocationProbe />
      </MemoryRouter>
    );

    await user.click(screen.getByRole("button", { name: "New chat" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/studio/guild-2");
  });

  it("routes sidebar navigation through an optional guard", async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/templates"]}>
        <WorkspaceSidebar guildId={null} guildName={null} onNavigate={onNavigate} />
        <LocationProbe />
      </MemoryRouter>
    );

    await user.click(screen.getByRole("link", { name: "Studio" }));

    expect(onNavigate).toHaveBeenCalledWith("/studio");
    expect(screen.getByTestId("location")).toHaveTextContent("/templates");
  });
});
