import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  acquireGuildLock,
  releaseGuildLock,
  heartbeatGuildLock,
  isGuildLocked,
  clearStaleLocks,
  startPeriodicLockCleanup,
} from "./locking";

interface LockRow {
  id: string;
  currentPlanId: string | null;
  lockAcquiredAt: Date | null;
  lockAcquiredBy: string | null;
  lockLastHeartbeatAt: Date | null;
}

const ONE_SECOND_MS = 1000;
const STALE_HEARTBEAT_THRESHOLD_MS = ONE_SECOND_MS;

function makeFakeDb() {
  const rows = new Map<string, LockRow>();
  let selectMode: "all" | "stale" = "all";

  function addRow(id: string, row: Partial<LockRow> = {}) {
    rows.set(id, {
      id,
      currentPlanId: null,
      lockAcquiredAt: null,
      lockAcquiredBy: null,
      lockLastHeartbeatAt: null,
      ...row,
    });
  }

  function setSelectMode(mode: "all" | "stale") {
    selectMode = mode;
  }

  function isRowStale(row: LockRow): boolean {
    if (row.currentPlanId === null) return false;
    if (!row.lockLastHeartbeatAt) return true;
    const age = Date.now() - row.lockLastHeartbeatAt.getTime();
    return age >= STALE_HEARTBEAT_THRESHOLD_MS;
  }

  const db = {
    update(_table: unknown) {
      return {
        set(values: Partial<LockRow>) {
          return {
            where(_cond: unknown) {
              const returningResult: Array<{ id: string; currentPlanId: string | null }> = [];
              const wantClearAll =
                Object.keys(values).length === 4 &&
                values.currentPlanId === null &&
                values.lockAcquiredAt === null &&
                values.lockAcquiredBy === null &&
                values.lockLastHeartbeatAt === null;
              const wantAcquire =
                "currentPlanId" in values && values.currentPlanId !== null;
              const wantHeartbeat =
                Object.keys(values).length === 1 && "lockLastHeartbeatAt" in values;

              for (const row of rows.values()) {
                if (wantAcquire) {
                  if (row.currentPlanId === null) {
                    Object.assign(row, values);
                    returningResult.push({ id: row.id, currentPlanId: row.currentPlanId });
                  }
                } else if (wantHeartbeat) {
                  if (row.currentPlanId !== null) {
                    Object.assign(row, values);
                  }
                } else if (wantClearAll) {
                  if (row.currentPlanId !== null) {
                    Object.assign(row, values);
                  }
                } else {
                  Object.assign(row, values);
                }
              }
              const chain = {
                returning: async () => returningResult,
                then: <T, R>(
                  onFulfilled?: (v: void) => T | PromiseLike<T>,
                  onRejected?: (e: unknown) => R | PromiseLike<R>
                ) => Promise.resolve().then(onFulfilled, onRejected),
              };
              return chain;
            },
          };
        },
      };
    },
    select(_projection: unknown) {
      return {
        from(_table: unknown) {
          return {
            async where(_cond: unknown) {
              const out: Array<{ id: string; currentPlanId: string | null }> = [];
              for (const row of rows.values()) {
                if (selectMode === "all") {
                  if (row.currentPlanId !== null) {
                    out.push({ id: row.id, currentPlanId: row.currentPlanId });
                  }
                } else {
                  if (isRowStale(row)) {
                    out.push({ id: row.id, currentPlanId: row.currentPlanId });
                  }
                }
              }
              return out;
            },
          };
        },
      };
    },
  };

  return { db, rows, addRow, setSelectMode };
}

vi.mock("../utils/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

describe("guild locking (fake db)", () => {
  let fake: ReturnType<typeof makeFakeDb>;

  beforeEach(() => {
    fake = makeFakeDb();
    fake.addRow("g1");
  });

  it("acquireGuildLock returns true on first acquire and sets fields", async () => {
    const ok = await acquireGuildLock("g1", "plan-1", "owner-1", fake.db as never);
    expect(ok).toBe(true);
    const row = fake.rows.get("g1")!;
    expect(row.currentPlanId).toBe("plan-1");
    expect(row.lockAcquiredBy).toBe("owner-1");
    expect(row.lockAcquiredAt).toBeInstanceOf(Date);
    expect(row.lockLastHeartbeatAt).toBeInstanceOf(Date);
  });

  it("acquireGuildLock returns false when guild is already locked", async () => {
    const first = await acquireGuildLock("g1", "plan-1", "owner-1", fake.db as never);
    expect(first).toBe(true);
    const second = await acquireGuildLock("g1", "plan-2", "owner-2", fake.db as never);
    expect(second).toBe(false);
    expect(fake.rows.get("g1")!.currentPlanId).toBe("plan-1");
    expect(fake.rows.get("g1")!.lockAcquiredBy).toBe("owner-1");
  });

  it("isGuildLocked returns false when unlocked, true when locked", async () => {
    expect(await isGuildLocked("g1", fake.db as never)).toBe(false);
    await acquireGuildLock("g1", "plan-1", "owner-1", fake.db as never);
    expect(await isGuildLocked("g1", fake.db as never)).toBe(true);
  });

  it("releaseGuildLock by matching owner clears all lock fields", async () => {
    await acquireGuildLock("g1", "plan-1", "owner-1", fake.db as never);
    await releaseGuildLock("g1", "owner-1", fake.db as never);
    const row = fake.rows.get("g1")!;
    expect(row.currentPlanId).toBeNull();
    expect(row.lockAcquiredBy).toBeNull();
    expect(row.lockAcquiredAt).toBeNull();
    expect(row.lockLastHeartbeatAt).toBeNull();
  });

  it("heartbeatGuildLock advances the timestamp", async () => {
    await acquireGuildLock("g1", "plan-1", "owner-1", fake.db as never);
    const before = fake.rows.get("g1")!.lockLastHeartbeatAt!;
    await new Promise((r) => setTimeout(r, 5));
    await heartbeatGuildLock("g1", "owner-1", fake.db as never);
    const after = fake.rows.get("g1")!.lockLastHeartbeatAt!;
    expect(after.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });

  it("clearStaleLocks keeps a fresh lock", async () => {
    await acquireGuildLock("g1", "plan-1", "owner-1", fake.db as never);
    fake.setSelectMode("stale");
    const cleared = await clearStaleLocks({ db: fake.db as never });
    expect(cleared).toBe(0);
    expect(fake.rows.get("g1")!.currentPlanId).toBe("plan-1");
  });

  it("clearStaleLocks clears a lock with an old heartbeat", async () => {
    await acquireGuildLock("g1", "plan-1", "owner-1", fake.db as never);
    const oldHeartbeat = new Date(Date.now() - STALE_HEARTBEAT_THRESHOLD_MS - 100);
    fake.rows.get("g1")!.lockLastHeartbeatAt = oldHeartbeat;
    fake.setSelectMode("stale");
    const cleared = await clearStaleLocks({ db: fake.db as never });
    expect(cleared).toBe(1);
    expect(fake.rows.get("g1")!.currentPlanId).toBeNull();
  });

  it("startPeriodicLockCleanup runs and can be stopped", async () => {
    const stop = startPeriodicLockCleanup({ intervalMs: 5 });
    await new Promise((r) => setTimeout(r, 20));
    stop();
  });
});
