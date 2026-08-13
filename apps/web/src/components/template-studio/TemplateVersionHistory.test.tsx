// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import TemplateVersionHistory from "./TemplateVersionHistory";

const versions = [
  { id: "one", version: 1, source: "initial", createdAt: "2026-08-01", structure: {} },
  { id: "two", version: 2, source: "manual", createdAt: "2026-08-02", structure: {} },
];
describe("TemplateVersionHistory", () => {
  it("renders newest first and exposes historical selection and revert", async () => {
    const onSelect = vi.fn();
    const onRevert = vi.fn();
    render(
      <TemplateVersionHistory
        versions={versions}
        currentVersion={2}
        selectedVersion={1}
        onSelect={onSelect}
        onRevert={onRevert}
      />
    );
    expect(screen.getAllByText(/Version/)[0]).toHaveTextContent("Version 2");
    await userEvent.click(screen.getByRole("button", { name: /Revert to this version/ }));
    expect(onRevert).toHaveBeenCalledWith(versions[0]);
  });
});
