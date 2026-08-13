import { describe, expect, it } from "vitest";
import { getOpenAIFunctionDefinitions, TEMPLATE_TOOL_NAMES, TOOL_REGISTRY } from "./registry";

describe("tool registry", () => {
  it("filters template tools without changing the default definition set", () => {
    const all = getOpenAIFunctionDefinitions();
    const template = getOpenAIFunctionDefinitions(TEMPLATE_TOOL_NAMES);

    expect(all).toHaveLength(TOOL_REGISTRY.length);
    expect(template.map((definition) => definition.function.name)).toContain("ask_user");
    expect(template.map((definition) => definition.function.name)).not.toContain(
      "add_role_to_member"
    );
    expect(template.map((definition) => definition.function.name)).not.toContain(
      "remove_role_from_member"
    );
  });
});
