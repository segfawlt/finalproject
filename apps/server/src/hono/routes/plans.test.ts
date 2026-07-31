import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const plansSource = readFileSync(fileURLToPath(new URL("./plans.ts", import.meta.url)), "utf8");

describe("manual rollback state capture", () => {
  it("uses a fresh Discord state instead of the custom cache", () => {
    const rollbackHandler = plansSource.slice(plansSource.indexOf('plansApp.post("/:planId/rollback"'));

    expect(rollbackHandler).toContain(
      "const currentState = await buildCurrentStateFromDiscord(guildId);"
    );
    expect(rollbackHandler).not.toContain("const currentState = buildServerState(guildId);");
  });
});
