// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TemplateViewer from "./TemplateViewer";

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock("../lib/api", () => ({ apiFetch }));

const template = {
  id: "one",
  version: 3,
  name: "Community",
  description: "A helpful server",
  category: "community",
  tags: [],
  structure: {
    channels: {
      cat: { id: "cat", name: "General", type: 4, position: 0 },
      ch: { id: "ch", name: "chat", type: 0, position: 1, parentId: "cat" },
    },
    roles: { role: { id: "role", name: "Member", position: 1, permissions: [] } },
    memberRoles: { member: { memberId: "member", roleIds: ["role"] } },
  },
  authorId: "user",
  updatedAt: "2026-08-12T00:00:00.000Z",
};

function renderViewer() {
  return render(
    <MemoryRouter initialEntries={["/templates/one"]}>
      <Routes>
        <Route path="/templates/:templateId" element={<TemplateViewer />} />
        <Route path="/templates/:templateId/studio" element={<div>template studio</div>} />
        <Route path="/templates" element={<div>library</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("TemplateViewer", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    apiFetch.mockResolvedValue(new Response(JSON.stringify(template), { status: 200 }));
  });

  it("shows structure and roles but hides members and tombstones", async () => {
    renderViewer();
    expect(await screen.findByText("#chat")).toBeVisible();
    expect(screen.getByText("A helpful server")).toBeVisible();
    expect(screen.getByText("Member")).toBeVisible();
    expect(screen.queryByText("Members")).toBeNull();
    expect(screen.queryByText("Already removed")).toBeNull();
  });

  it("uses the server fork and immediate delete lifecycle endpoints", async () => {
    renderViewer();
    await screen.findByRole("heading", { name: "Community" });
    apiFetch.mockResolvedValueOnce(new Response(JSON.stringify({ id: "forked" }), { status: 201 }));
    await userEvent.click(screen.getByRole("button", { name: /Fork/ }));
    expect(apiFetch).toHaveBeenLastCalledWith("/api/templates/one/fork", { method: "POST" });
    expect(await screen.findByText("template studio")).toBeVisible();
  });

  it("deletes immediately and returns to the library", async () => {
    renderViewer();
    await screen.findByRole("heading", { name: "Community" });
    apiFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await userEvent.click(screen.getByRole("button", { name: /Delete/ }));
    expect(apiFetch).toHaveBeenLastCalledWith("/api/templates/one", { method: "DELETE" });
    expect(await screen.findByText("library")).toBeVisible();
  });
});
