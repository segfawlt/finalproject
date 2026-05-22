# Discord Platform — Design Docs

Source of truth for system design. Each doc covers one subsystem. Referenced during implementation.

## Docs

| # | File | What It Covers |
|---|------|----------------|
| 1 | [overview.md](./overview.md) | Tech stack, project structure, deployment, 6-phase flow |
| 2 | [desired-state-and-diff-engine.md](./desired-state-and-diff-engine.md) | DesiredState data model, tombstones, diff engine algorithm |
| 3 | [planning-and-execution.md](./planning-and-execution.md) | Planning loop, tool calling, ask_user, symbol resolution, execution engine |
| 4 | [validation-and-safety.md](./validation-and-safety.md) | 4-layer prevention stack, Stage 1/2 validation, safety guards |
| 5 | [studio-and-dashboard.md](./studio-and-dashboard.md) | Studio architecture, iteration history, manual edits, dashboard |
| 6 | [template-system.md](./template-system.md) | Template storage/retrieval, guidance system, template authoring |
| 7 | [plan-storage.md](./plan-storage.md) | Plan JSON structure, snapshots, rollback, status state machine |
| 8 | [security.md](./security.md) | Bot ADMINISTRATOR requirement, auth, guild locking, pre-execution checks |
