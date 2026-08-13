// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TemplatesTab from "./TemplatesTab";

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock("../../lib/api", () => ({ apiFetch }));

describe("TemplatesTab", () => {
  beforeEach(() => {
    apiFetch.mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: "template-1",
          name: "Community",
          description: "A community layout",
          category: null,
          tags: [],
          isOfficial: false,
          status: "published",
          version: 1,
          structure: { channels: {}, roles: {} },
        },
      ],
    });
  });

  it("uses a template in the active conversation and links to its canonical viewer", async () => {
    render(
      <MemoryRouter>
        <TemplatesTab
          guildId="guild-1"
          conversationId="conversation-1"
          activeTemplates={[]}
          onActiveTemplatesChange={vi.fn()}
        />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText("Community")).toBeInTheDocument());
    expect(screen.getByRole("link", { name: /view template/i })).toHaveAttribute(
      "href",
      "/templates/template-1"
    );
    expect(screen.getByRole("button", { name: "Use Community" })).toBeInTheDocument();
    expect(screen.queryByText(/merge/i)).not.toBeInTheDocument();
  });

  it("keeps a template pending locally before a conversation exists", async () => {
    const onActiveTemplatesChange = vi.fn();
    render(
      <MemoryRouter>
        <TemplatesTab
          guildId="guild-1"
          conversationId={null}
          activeTemplates={[]}
          onActiveTemplatesChange={onActiveTemplatesChange}
        />
      </MemoryRouter>
    );

    const button = await screen.findByRole("button", { name: "Use Community" });
    expect(button).toBeEnabled();
    apiFetch.mockClear();
    fireEvent.click(button);

    expect(onActiveTemplatesChange).toHaveBeenCalledWith([
      { id: "template-1", name: "Community" },
    ]);
    expect(apiFetch).not.toHaveBeenCalled();
  });
});
