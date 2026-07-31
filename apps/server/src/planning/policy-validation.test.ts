import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { validatePlan } from "./validation";
import type { DesiredState, PlanStep, SymbolTable } from "@repo/shared";

const policyMocks = vi.hoisted(() => ({
  guildRules: [] as Array<{ ruleText: string }>,
  selectError: null as Error | null,
  validatedEnv: {
    LLM_API_KEY: null as string | null,
    LLM_BASE_URL: "https://example.test/v1",
    LLM_MODEL: "test-model",
    WEB_APP_URL: "http://localhost:5173",
  },
}));

vi.mock("../bot/permissions", () => ({
  botHasAdministrator: vi.fn(() => true),
  getBotHighestRolePosition: vi.fn(() => 5),
}));

vi.mock("../bot/cache", () => ({
  guildCache: {
    get: vi.fn(() => ({ roles: new Map() })),
  },
}));

vi.mock("../env-validated", () => ({
  validatedEnv: policyMocks.validatedEnv,
}));

vi.mock("@repo/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(async () => {
          if (policyMocks.selectError) throw policyMocks.selectError;
          return policyMocks.guildRules;
        }),
      })),
    })),
  },
  rules: { guildId: "guild_id" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(() => ({})),
}));

const desiredState: DesiredState = {
  guildId: "g1",
  guildName: "Test",
  active: {
    channels: {
      $category_0: {
        id: "$category_0",
        name: "Community",
        type: 4,
        parentId: null,
        position: 0,
      },
    },
    roles: {},
    overwrites: {},
    memberRoles: {},
  },
  tombstones: [],
  symbolCounter: 1,
  version: 1,
};

const steps: PlanStep[] = [
  {
    index: 0,
    toolName: "create_category",
    params: { name: "Community" },
    status: "pending",
  },
];

const symbolTable: SymbolTable = {
  $category_0: {
    symbol: "$category_0",
    type: "channel",
    definingStepIndex: 0,
  },
};

async function runValidation() {
  return validatePlan({
    steps,
    symbolTable,
    desiredState,
    guildId: "g1",
    status: "draft",
  });
}

function policyIssues(result: Awaited<ReturnType<typeof runValidation>>) {
  return result.issues.filter((issue) => issue.group === "Stage 2: Policy");
}

function makePolicyResponse(content: string, status = 200): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content } }],
    }),
    {
      status,
      headers: { "Content-Type": "application/json" },
    }
  );
}

beforeEach(() => {
  policyMocks.guildRules = [];
  policyMocks.selectError = null;
  policyMocks.validatedEnv.LLM_API_KEY = null;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("validatePlan Stage 2 policy availability", () => {
  it("does not require an LLM key when the guild has no rules", async () => {
    const result = await runValidation();

    expect(policyIssues(result)).toEqual([]);
    expect(result.passed).toBe(true);
  });

  it("blocks when rules exist but no LLM key is configured", async () => {
    policyMocks.guildRules = [{ ruleText: "Never delete the announcements channel." }];

    const result = await runValidation();

    expect(result.passed).toBe(false);
    expect(policyIssues(result)).toEqual([
      expect.objectContaining({
        severity: "block",
        message: expect.stringContaining("unavailable"),
      }),
    ]);
  });

  it("blocks when loading guild rules fails", async () => {
    policyMocks.selectError = new Error("database unavailable");

    const result = await runValidation();

    expect(result.passed).toBe(false);
    expect(policyIssues(result)[0]?.message).toContain("could not be loaded");
  });

  it("blocks when the policy provider returns a non-success response", async () => {
    policyMocks.guildRules = [{ ruleText: "Never delete the announcements channel." }];
    policyMocks.validatedEnv.LLM_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => makePolicyResponse("", 503))
    );

    const result = await runValidation();

    expect(result.passed).toBe(false);
    expect(policyIssues(result)[0]?.message).toContain("provider returned status 503");
  });

  it("blocks when the policy provider returns no content", async () => {
    policyMocks.guildRules = [{ ruleText: "Never delete the announcements channel." }];
    policyMocks.validatedEnv.LLM_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(JSON.stringify({ choices: [{ message: {} }] }), { status: 200 });
      })
    );

    const result = await runValidation();

    expect(result.passed).toBe(false);
    expect(policyIssues(result)[0]?.message).toContain("empty response");
  });

  it.each([
    "not JSON",
    "{}",
    '{"violations":"none"}',
    '{"violations":[{"rule":"Rule","severity":"allow","message":"Invalid severity"}]}',
  ])("blocks malformed policy output: %s", async (content) => {
    policyMocks.guildRules = [{ ruleText: "Never delete the announcements channel." }];
    policyMocks.validatedEnv.LLM_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => makePolicyResponse(content))
    );

    const result = await runValidation();

    expect(result.passed).toBe(false);
    expect(policyIssues(result)[0]?.message).toContain("invalid response");
  });

  it("passes when the provider returns a valid empty violation list", async () => {
    policyMocks.guildRules = [{ ruleText: "Never delete the announcements channel." }];
    policyMocks.validatedEnv.LLM_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => makePolicyResponse(JSON.stringify({ violations: [] })))
    );

    const result = await runValidation();

    expect(policyIssues(result)).toEqual([]);
    expect(result.passed).toBe(true);
  });

  it("preserves valid policy blockers and warnings", async () => {
    policyMocks.guildRules = [{ ruleText: "Never delete the announcements channel." }];
    policyMocks.validatedEnv.LLM_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        makePolicyResponse(
          JSON.stringify({
            violations: [
              {
                rule: "Never delete announcements.",
                severity: "block",
                message: "The plan deletes announcements.",
              },
              {
                rule: "Prefer concise channel names.",
                severity: "warning",
                message: "A proposed channel name is long.",
              },
            ],
          })
        )
      )
    );

    const result = await runValidation();

    expect(result.passed).toBe(false);
    expect(policyIssues(result)).toEqual([
      expect.objectContaining({
        severity: "block",
        message: "The plan deletes announcements.",
      }),
      expect.objectContaining({
        severity: "warning",
        message: "A proposed channel name is long.",
      }),
    ]);
  });

  it("blocks when the policy request throws", async () => {
    policyMocks.guildRules = [{ ruleText: "Never delete the announcements channel." }];
    policyMocks.validatedEnv.LLM_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new Error("network unavailable")))
    );

    const result = await runValidation();

    expect(result.passed).toBe(false);
    expect(policyIssues(result)[0]?.message).toContain("request failed");
  });

  it("bounds the policy request with a 30-second abort signal", async () => {
    policyMocks.guildRules = [{ ruleText: "Never delete the announcements channel." }];
    policyMocks.validatedEnv.LLM_API_KEY = "test-key";
    const timeoutSignal = new AbortController().signal;
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout").mockReturnValue(timeoutSignal);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: unknown, init?: RequestInit) => {
        expect(init?.signal).toBe(timeoutSignal);
        throw new DOMException("The operation was aborted", "AbortError");
      })
    );

    const result = await runValidation();

    expect(timeoutSpy).toHaveBeenCalledWith(30_000);
    expect(result.passed).toBe(false);
    expect(policyIssues(result)[0]?.message).toContain("request failed");
  });
});
