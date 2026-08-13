// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ModelSelector, {
  getReasoningControls,
  getCompactModelLabel,
  getReasoningLabel,
} from "./ModelSelector";

describe("getReasoningControls", () => {
  it("builds compact labels from the active configuration", () => {
    const model = {
      id: "deepseek/deepseek-v4-flash-0731",
      name: "DeepSeek V4 Flash",
      description: "",
      supportsTools: true,
    };

    expect(getCompactModelLabel(model)).toBe("DeepSeek V4 Flash");
    expect(getReasoningLabel({ modelId: model.id, reasoning: { effort: "high" } })).toBe(
      "Thinking: High"
    );
    expect(getReasoningLabel({ modelId: model.id })).toBe("Thinking off");
  });

  it("marks models without reasoning metadata as unavailable", () => {
    expect(getReasoningControls()).toEqual({ kind: "unavailable" });
  });

  it("does not offer off when effort reasoning is mandatory", () => {
    expect(
      getReasoningControls({
        supportedEfforts: ["minimal", "low", "medium", "high", "xhigh", "max"],
        defaultEnabled: true,
        defaultEffort: "medium",
        mandatory: true,
      })
    ).toEqual({
      kind: "effort",
      efforts: ["minimal", "low", "medium", "high", "xhigh", "max"],
      defaultEnabled: true,
      defaultEffort: "medium",
      mandatory: true,
    });
  });

  it("offers off alongside every advertised nonmandatory effort", () => {
    expect(
      getReasoningControls({
        supportedEfforts: ["minimal", "high", "max"],
        defaultEnabled: false,
        mandatory: false,
      })
    ).toEqual({
      kind: "effort",
      efforts: ["off", "minimal", "high", "max"],
      defaultEnabled: false,
      defaultEffort: undefined,
      mandatory: false,
    });
  });

  it("returns the advertised maximum for max-token-only reasoning", () => {
    expect(
      getReasoningControls({ supportsMaxTokens: true, maxTokens: 4096, defaultEnabled: true })
    ).toEqual({ kind: "max-tokens", maxTokens: 4096, defaultEnabled: true });
  });
});

describe("ModelSelector compact menu", () => {
  it("opens its model menu above a docked composer", async () => {
    const user = userEvent.setup();
    render(
      <ModelSelector
        compact
        models={[
          { id: "openai/gpt-4o-mini", name: "GPT-4o mini", description: "", supportsTools: true },
        ]}
        value={{ modelId: "openai/gpt-4o-mini" }}
        onChange={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Select model" }));

    expect(screen.getByRole("listbox", { name: "Model choices" })).toHaveClass("bottom-full");
  });
});
