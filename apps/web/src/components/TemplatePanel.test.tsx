// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TemplatePanel from "./TemplatePanel";

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock("../lib/api", () => ({ apiFetch }));

const template = {
  id: "template-1",
  name: "Community",
  description: "A community layout",
  category: null,
  tags: [],
  isOfficial: false,
  status: "published",
  version: 1,
};

describe("TemplatePanel", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    apiFetch.mockResolvedValue({ ok: true, json: async () => [template] });
  });

  it("attaches and detaches template context without a merge request", async () => {
    const onActiveChange = vi.fn();
    const user = userEvent.setup();
    const view = render(
      <MemoryRouter>
        <TemplatePanel
          guildId="guild-1"
          conversationId="conversation-1"
          active={[]}
          onActiveChange={onActiveChange}
        />
      </MemoryRouter>
    );

    await user.click(screen.getAllByRole("button", { name: /browse/i })[0]!);
    await waitFor(() => expect(screen.getByText("Community")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Use" }));
    expect(apiFetch).toHaveBeenCalledWith(
      "/api/guilds/guild-1/conversations/conversation-1/templates",
      expect.objectContaining({ method: "POST" })
    );
    expect(apiFetch.mock.calls.some(([url]) => String(url).includes("merge"))).toBe(false);

    view.rerender(
      <MemoryRouter>
        <TemplatePanel
          guildId="guild-1"
          conversationId="conversation-1"
          active={[{ id: "template-1", name: "Community" }]}
          onActiveChange={onActiveChange}
        />
      </MemoryRouter>
    );
    await user.click(screen.getByRole("button", { name: /active \(1\)/i }));
    await user.click(screen.getByRole("button", { name: /stop using community/i }));
    expect(apiFetch).toHaveBeenCalledWith(
      "/api/guilds/guild-1/conversations/conversation-1/templates/template-1",
      { method: "DELETE" }
    );
  });
});
