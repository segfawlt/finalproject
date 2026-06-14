import { describe, it, expect } from "vitest";
import { DesiredStateStore } from "../state";
import {
  batchSetOverwriteSchema,
  planOverwriteBatch,
  getOverwriteBatchAssumptions,
} from "./permissions";

describe("batchSetOverwriteSchema", () => {
  it("parses a batch of overwrites", () => {
    const params = {
      overwrites: [
        { channel_id: "ch1", role_id: "role1", allow: ["VIEW_CHANNEL"], deny: [] },
        { channel_id: "ch1", role_id: "role2", deny: ["SEND_MESSAGES"] },
        { channel_id: "ch2", role_id: "role1" },
      ],
    };
    const parsed = batchSetOverwriteSchema.parse(params);
    expect(parsed.overwrites).toHaveLength(3);
    expect(parsed.overwrites[1].deny).toEqual(["SEND_MESSAGES"]);
  });

  it("rejects empty overwrites array", () => {
    const params = { overwrites: [] };
    expect(() => batchSetOverwriteSchema.parse(params)).toThrow();
  });

  it("rejects missing channel_id", () => {
    const params = { overwrites: [{ role_id: "r1" }] };
    expect(() => batchSetOverwriteSchema.parse(params)).toThrow();
  });
});

describe("planOverwriteBatch", () => {
  it("stores multiple overwrites in desired state", () => {
    const store = new DesiredStateStore();
    // Seed a channel and role so setOverwrite doesn't fail
    const chSym = store.addChannel({ name: "general", type: 0 });
    const roleSym = store.addRole({ name: "Admin" });

    const params = {
      overwrites: [
        { channel_id: chSym, role_id: roleSym, allow: ["VIEW_CHANNEL"], deny: [] },
        { channel_id: chSym, role_id: roleSym, deny: ["SEND_MESSAGES"] },
      ],
    };

    const result = planOverwriteBatch(params, store);
    expect(result.planned).toBe(true);

    const state = store.getState();
    expect(Object.keys(state.active.overwrites)).toHaveLength(1);
    const ow = state.active.overwrites[`${chSym}:${roleSym}`];
    expect(ow.deny).toEqual(["SEND_MESSAGES"]);
  });
});

describe("getOverwriteBatchAssumptions", () => {
  it("generates exists assumptions for each overwrite", () => {
    const params = {
      overwrites: [
        { channel_id: "ch1", role_id: "role1" },
        { channel_id: "ch2", role_id: "role2" },
      ],
    };
    const assumptions = getOverwriteBatchAssumptions(params);
    expect(assumptions).toHaveLength(4); // 2 channel exists + 2 role exists
    expect(assumptions.every((a) => a.type === "exists")).toBe(true);
  });

  it("adds warn_everyone_view for @everyone deny VIEW_CHANNEL", () => {
    const params = {
      overwrites: [
        { channel_id: "ch1", role_id: "@everyone", deny: ["VIEW_CHANNEL"] },
        { channel_id: "ch2", role_id: "role1" },
      ],
    };
    const assumptions = getOverwriteBatchAssumptions(params);
    const warns = assumptions.filter((a) => a.type === "warn_everyone_view");
    expect(warns).toHaveLength(1);
    expect(warns[0].value).toBe("@everyone");
  });
});

describe("planOverwriteBatch — atomicity", () => {
  it("rolls back no earlier mutations when a later reference is invalid", () => {
    const store = new DesiredStateStore();
    const chSym = store.addChannel({ name: "general", type: 0 });
    const roleSym = store.addRole({ name: "Admin" });

    const params = {
      overwrites: [
        { channel_id: chSym, role_id: roleSym, deny: ["SEND_MESSAGES"] },
        { channel_id: "missing-channel", role_id: roleSym, deny: ["VIEW_CHANNEL"] },
      ],
    };

    expect(() => planOverwriteBatch(params, store)).toThrow();

    const state = store.getState();
    expect(Object.keys(state.active.overwrites)).toHaveLength(0);
  });
});
