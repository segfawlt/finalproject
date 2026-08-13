// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Templates from "./Templates";

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock("../lib/api", () => ({ apiFetch }));

function renderLibrary() {
  return render(
    <MemoryRouter initialEntries={["/templates"]}>
      <Routes>
        <Route path="/templates" element={<Templates />} />
        <Route path="/templates/:templateId/studio" element={<div>template studio</div>} />
        <Route path="/templates/:templateId" element={<div>template viewer</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("Templates library", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    apiFetch.mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            id: "one",
            name: "Community",
            description: "A helpful server",
            category: "community",
            tags: [],
            status: "active",
            version: 2,
            structure: {
              channels: { general: {}, rules: {} },
              roles: { member: {} },
            },
            updatedAt: "2026-08-12T00:00:00.000Z",
          },
        ]),
        { status: 200 }
      )
    );
  });

  it("uses the global API and searches name, description, and category", async () => {
    renderLibrary();
    expect(await screen.findByText("Community")).toBeVisible();
    expect(screen.getByText("2 channels")).toBeVisible();
    expect(screen.getByText("1 role")).toBeVisible();
    expect(screen.getByText("A helpful server")).toBeVisible();
    expect(screen.getByText("Updated Aug 12, 2026")).toBeVisible();
    expect(apiFetch).toHaveBeenCalledWith("/api/templates");

    const search = screen.getByPlaceholderText("Search templates…");
    await userEvent.type(search, "community");
    expect(screen.getByText("Community")).toBeVisible();
    await userEvent.clear(search);
    await userEvent.type(search, "helpful");
    expect(screen.getByText("Community")).toBeVisible();
  });

  it("creates a blank template and opens its canonical studio route", async () => {
    apiFetch.mockResolvedValueOnce(new Response("[]", { status: 200 }));
    apiFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "new-template" }), { status: 201 })
    );
    renderLibrary();

    await userEvent.click(await screen.findByRole("button", { name: "Create blank template" }));
    await waitFor(() => expect(screen.getByText("template studio")).toBeVisible());
    expect(apiFetch).toHaveBeenLastCalledWith(
      "/api/templates",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("links cards to the canonical viewer route", async () => {
    renderLibrary();
    expect(await screen.findByRole("link", { name: /Community/ })).toHaveAttribute(
      "href",
      "/templates/one"
    );
  });
});
