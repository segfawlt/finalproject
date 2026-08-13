import { beforeEach, describe, expect, it, vi } from "vitest";

const tables = vi.hoisted(() => ({
  templates: { id: "templates.id", authorId: "templates.authorId" },
  templateVersions: {
    templateId: "templateVersions.templateId",
    version: "templateVersions.version",
  },
}));

vi.mock("@repo/db", () => ({
  db: {},
  templates: tables.templates,
  templateVersions: tables.templateVersions,
}));
vi.mock("drizzle-orm", () => ({
  and: (...values: unknown[]) => values,
  eq: (left: unknown, right: unknown) => ({ left, right }),
}));

import {
  commitTemplateStructure,
  createTemplate,
  forkTemplate,
  revertTemplateVersion,
  TemplateVersionConflictError,
  updateTemplateMetadata,
} from "./template-version-service";
import {
  emptyTemplateStructure,
  fromTemplateDesiredState,
  toTemplateDesiredState,
} from "./template-state";

type Row = Record<string, any>;

function makeDatabase() {
  const state = { templates: [] as Row[], versions: [] as Row[] };
  const trace = { where: [] as unknown[], updateWhere: [] as unknown[], locks: [] as string[] };
  function matches(row: Row, condition: unknown): boolean {
    if (Array.isArray(condition)) return condition.every((item) => matches(row, item));
    if (!condition || typeof condition !== "object") return true;
    const predicate = condition as { left?: string; right?: unknown };
    if (
      predicate.left === tables.templates.id ||
      predicate.left === tables.templateVersions.templateId
    ) {
      return row.id === predicate.right || row.templateId === predicate.right;
    }
    if (predicate.left === tables.templates.authorId) return row.authorId === predicate.right;
    if (predicate.left === tables.templateVersions.version) return row.version === predicate.right;
    return true;
  }
  function query(values: Row[], condition?: unknown) {
    const result =
      condition === undefined ? values : values.filter((row) => matches(row, condition));
    return {
      then: (resolve: (value: Row[]) => unknown) => Promise.resolve(resolve(result)),
      for: async (mode: string) => {
        trace.locks.push(mode);
        return result;
      },
    };
  }
  const transaction = {
    select: () => ({
      from: (table: unknown) => ({
        where: (condition?: unknown) => {
          const values = table === tables.templates ? state.templates : state.versions;
          trace.where.push(condition);
          return query(values, condition);
        },
      }),
    }),
    insert: (table: unknown) => ({
      values: async (value: Row) => {
        (table === tables.templates ? state.templates : state.versions).push({
          ...value,
          ...(table === tables.templates ? { updatedAt: new Date() } : {}),
        });
      },
    }),
    update: (table: unknown) => ({
      set: (changes: Row) => ({
        where: (condition: unknown) => ({
          returning: async () => {
            trace.updateWhere.push(condition);
            const rows = state.templates.filter(
              (row) => table === tables.templates && matches(row, condition)
            );
            rows.forEach((row) => Object.assign(row, changes));
            return rows;
          },
        }),
        returning: async () => {
          const row = state.templates[0];
          Object.assign(row, changes);
          return [row];
        },
      }),
    }),
  };
  return {
    state,
    trace,
    database: {
      transaction: async (callback: (tx: typeof transaction) => unknown) => callback(transaction),
    } as never,
  };
}

function templateRow(overrides: Row = {}): Row {
  return {
    id: "t1",
    authorId: "u1",
    name: "Template",
    description: "Description",
    structure: emptyTemplateStructure(),
    category: null,
    tags: [],
    version: 1,
    ...overrides,
  };
}

/*
 * Keep this assertion explicit: update queries must remain creator-scoped too,
 * not just the locking read.
 */
function expectOwnedPredicate(condition: unknown, id: string, authorId: string) {
  expect(condition).toEqual([
    { left: tables.templates.id, right: id },
    { left: tables.templates.authorId, right: authorId },
  ]);
}

describe("template version service", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates an empty template and its immutable initial snapshot", async () => {
    const { database, state } = makeDatabase();
    await createTemplate({ id: "t1", authorId: "u1", name: "Blank" }, database);

    expect(state.templates[0].structure).toEqual(emptyTemplateStructure());
    expect(state.templates[0].version).toBe(1);
    expect(state.versions).toEqual([
      expect.objectContaining({ templateId: "t1", version: 1, source: "initial" }),
    ]);
  });

  it("creates a seeded template with the supplied structure as version one", async () => {
    const { database, state } = makeDatabase();
    const structure = {
      channels: { $ch_4: { id: "$ch_4" } },
      roles: {},
      overwrites: {},
      memberRoles: {},
    };

    await createTemplate({ id: "t1", authorId: "u1", name: "Seeded", structure }, database);

    expect(state.templates[0]).toMatchObject({ id: "t1", structure, version: 1 });
    expect(state.versions[0]).toMatchObject({
      templateId: "t1",
      version: 1,
      structure,
      source: "initial",
    });
  });

  it("forks an owned template as an independent version-one template", async () => {
    const { database, state, trace } = makeDatabase();
    const structure = {
      channels: { $ch_4: { id: "$ch_4" } },
      roles: {},
      overwrites: {},
      memberRoles: {},
    };
    state.templates.push(
      templateRow({ id: "source", name: "Staff", description: "Private", structure, version: 3 })
    );

    await forkTemplate({ templateId: "source", authorId: "u1", id: "fork" }, database);

    expect(state.templates[1]).toMatchObject({
      id: "fork",
      name: "Fork of Staff",
      description: "Private",
      structure,
      version: 1,
    });
    expect(state.templates[1].structure).not.toBe(state.templates[0].structure);
    expect(state.versions).toEqual([
      expect.objectContaining({ templateId: "fork", version: 1, source: "initial", structure }),
    ]);
    (state.templates[1].structure.channels as Row).$ch_4.id = "changed";
    expect((state.templates[0].structure.channels as Row).$ch_4.id).toBe("$ch_4");
    expect((state.versions[0].structure.channels as Row).$ch_4.id).toBe("$ch_4");
    expectOwnedPredicate(trace.where[0], "source", "u1");
    expect(trace.locks).toEqual(["update"]);
  });

  it("updates metadata without changing the version history", async () => {
    const { database, state, trace } = makeDatabase();
    state.templates.push(templateRow({ name: "Old", description: "" }));

    await updateTemplateMetadata("t1", "u1", { name: "New" }, database);

    expect(state.templates[0]).toMatchObject({ name: "New", version: 1 });
    expect(state.versions).toEqual([]);
    expectOwnedPredicate(trace.where[0], "t1", "u1");
    expect(trace.updateWhere[0]).toEqual({ left: tables.templates.id, right: "t1" });
    expect(trace.locks).toEqual(["update"]);
  });

  it("commits manual structure changes with the next version and source", async () => {
    const { database, state, trace } = makeDatabase();
    state.templates.push(templateRow());
    const structure = {
      channels: { $ch_1: { id: "$ch_1" } },
      roles: {},
      overwrites: {},
      memberRoles: {},
    };

    await commitTemplateStructure(
      {
        templateId: "t1",
        authorId: "u1",
        expectedVersion: 1,
        source: "manual",
        structure,
      },
      database
    );

    expect(state.templates[0]).toMatchObject({ version: 2, structure });
    expect(state.versions).toEqual([
      expect.objectContaining({ version: 2, source: "manual", structure }),
    ]);
    expectOwnedPredicate(trace.where[0], "t1", "u1");
    expect(trace.updateWhere[0]).toEqual({ left: tables.templates.id, right: "t1" });
    expect(trace.locks).toEqual(["update"]);
  });

  it("records an AI commit and its authoring turn", async () => {
    const { database, state } = makeDatabase();
    state.templates.push(templateRow());

    await commitTemplateStructure(
      {
        templateId: "t1",
        authorId: "u1",
        expectedVersion: 1,
        source: "ai",
        authoringTurnId: "turn-1",
        structure: { channels: { $ch_2: {} } },
      },
      database
    );

    expect(state.versions[0]).toMatchObject({
      version: 2,
      source: "ai",
      authoringTurnId: "turn-1",
    });
  });

  it("does not create an AI version when only object keys are reordered", async () => {
    const { database, state } = makeDatabase();
    state.templates.push(
      templateRow({
        structure: {
          channels: { $ch_1: { name: "x", id: "$ch_1" } },
          roles: {},
          overwrites: {},
          memberRoles: {},
        },
      })
    );

    await commitTemplateStructure(
      {
        templateId: "t1",
        authorId: "u1",
        expectedVersion: 1,
        source: "ai",
        structure: {
          memberRoles: {},
          overwrites: {},
          roles: {},
          channels: { $ch_1: { id: "$ch_1", name: "x" } },
        },
      },
      database
    );

    expect(state.templates[0].version).toBe(1);
    expect(state.versions).toEqual([]);
  });

  it("rejects stale commits and reverts through a new snapshot", async () => {
    const { database, state } = makeDatabase();
    state.templates.push({
      id: "t1",
      authorId: "u1",
      name: "Template",
      structure: { channels: {}, roles: {}, overwrites: {}, memberRoles: {} },
      version: 2,
    });
    state.versions.push({ templateId: "t1", version: 1, structure: { roles: { $role_2: {} } } });

    await expect(
      commitTemplateStructure(
        {
          templateId: "t1",
          authorId: "u1",
          expectedVersion: 1,
          source: "ai",
          structure: {},
        },
        database
      )
    ).rejects.toBeInstanceOf(TemplateVersionConflictError);

    await revertTemplateVersion(
      { templateId: "t1", authorId: "u1", version: 1, expectedVersion: 2 },
      database
    );
    expect(state.templates[0].version).toBe(3);
    expect(state.versions.at(-1)).toMatchObject({ version: 3, source: "revert" });
  });
});

describe("template state", () => {
  it("normalizes maps, derives symbols, and omits tombstones when persisted", () => {
    const state = toTemplateDesiredState("t1", "Template", 4, {
      channels: { $ch_2: {} },
      roles: { $role_9: {} },
    });
    expect(state.symbolCounter).toBe(10);
    expect(state.tombstones).toEqual([]);
    expect(fromTemplateDesiredState(state)).toEqual({
      channels: { $ch_2: {} },
      roles: { $role_9: {} },
      overwrites: {},
      memberRoles: {},
    });
  });
});
