// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TemplateStudio from "./TemplateStudio";

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock("../lib/api", () => ({ apiFetch }));
vi.mock("../components/template-studio/TemplatePreview", () => ({
  default: (props: { onDirtyChange?: (dirty: boolean) => void }) => (
    <button type="button" onClick={() => props.onDirtyChange?.(true)}>
      Make preview dirty
    </button>
  ),
}));

const template = {
  id: "one",
  version: 3,
  name: "Community",
  description: "A helpful server",
  category: "community",
  tags: [],
  structure: { channels: {}, roles: {}, overwrites: {}, memberRoles: {} },
  updatedAt: "2026-08-12T00:00:00.000Z",
};

const versions = [
  { version: 3, structure: template.structure, source: "authoring", createdAt: template.updatedAt },
  { version: 2, structure: template.structure, source: "manual", createdAt: template.updatedAt },
];

const turns = [
  {
    id: "turn-one",
    prompt: "Add a welcome channel",
    status: "completed",
    summary: "Added a welcome channel.",
    createdAt: template.updatedAt,
  },
];

function renderStudio() {
  return render(
    <MemoryRouter initialEntries={["/templates/one/studio"]}>
      <Routes>
        <Route path="/templates/:templateId/studio" element={<TemplateStudio />} />
        <Route path="/templates/:templateId" element={<div>viewer</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("TemplateStudio", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    apiFetch.mockImplementation((path: string) => {
      if (path.endsWith("/versions"))
        return Promise.resolve(new Response(JSON.stringify(versions)));
      if (path.endsWith("/turns")) return Promise.resolve(new Response(JSON.stringify(turns)));
      return Promise.resolve(new Response(JSON.stringify(template)));
    });
  });

  it("shows version history, persisted authoring turns, and the template composer", async () => {
    renderStudio();

    expect(await screen.findByText("Version history")).toBeVisible();
    expect(screen.queryByText("Recent conversations")).toBeNull();
    expect(await screen.findByText("Add a welcome channel")).toBeVisible();
    expect(screen.getByText("Added a welcome channel.")).toBeVisible();
    expect(screen.getByPlaceholderText("Describe a template change…")).toBeVisible();
  });

  it("keeps the draft guard dialog open when leaving with a dirty preview", async () => {
    renderStudio();
    await screen.findByText("Version history");
    await userEvent.click(screen.getByRole("button", { name: "Make preview dirty" }));
    await userEvent.click(screen.getAllByRole("link", { name: "Back to viewer" })[0]);

    expect(screen.getByText("Unsaved structure changes")).toBeVisible();
    expect(screen.getByRole("button", { name: "Save" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Discard" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Stay" })).toBeVisible();
  });
});
