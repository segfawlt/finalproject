// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import TemplatePreview from "./TemplatePreview";

describe("TemplatePreview", () => {
  it("keeps edits local until one explicit save and supports cancel", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <TemplatePreview
        name="Example"
        version={1}
        structure={{ channels: {}, roles: {} }}
        onSave={onSave}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: "Edit structure" }));
    expect(screen.getByText("editing")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onSave).not.toHaveBeenCalled();
  });

  it("reports the local structure so a parent guard can save it", async () => {
    const onDraftChange = vi.fn();
    render(
      <TemplatePreview
        name="Example"
        version={1}
        structure={{ channels: {}, roles: {} }}
        onDraftChange={onDraftChange}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: "Edit structure" }));

    expect(onDraftChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ active: expect.any(Object) })
    );
  });
});
