# Learnings Index

Indexed catalog of durable lessons captured by the `compound` skill. Read at session start; check entries with relevant tags before non-trivial work.

## Categories

Lessons are organized by category. Use the category directory closest to the problem area.

- `build-errors/` — TypeScript, Vite, pnpm, bundler
- `test-failures/` — Vitest, mocks, assertions
- `runtime-errors/` — Production crashes, unhandled rejections
- `database-issues/` — Drizzle, PostgreSQL, JSONB, migrations
- `permissions/` — Discord permission bits, role hierarchy, overwrites
- `bot-lifecycle/` — Discord.js cache, events, reconnection
- `auth/` — Better Auth, OAuth, sessions
- `integration-issues/` — Hono routes, SSE, middleware
- `logic-errors/` — Diff engine, execution engine, planning session
- `architecture-patterns/` — Project structure, module boundaries
- `design-patterns/` — Reusable non-architectural patterns
- `conventions/` — Team-agreed way of doing something
- `tooling-decisions/` — Library or tool choices with durable rationale
- `best-practices/` — Fallback only when no narrower category applies

## Pending Terms

Domain-specific terms flagged for `CONCEPTS.md` (project vocabulary glossary). When this list has 5+ terms, bootstrap `CONCEPTS.md` at repo root.

- `DesiredState` — the declarative target server configuration mutated during planning and diffed against current Discord state.
- `DriftEvent` — a persisted and streamed notification that Discord state changed outside the active plan.

## Promote Candidates

Lessons referenced 3+ times. Review weekly — if a lesson deserves a spot in `AGENTS.md` as a project-wide rule, copy its core directive there and add `[PROMOTED]` to the learning's title.

- [Promise.race to add a deadline to an API with no cancellation hook](./design-patterns/promise-race-for-uncancellable-api.md) — the repeated lesson is that a deadline can stop the caller waiting but cannot cancel an external operation whose API has no cancellation hook. References: 3.
- [Load .env for Vitest server suites](./test-failures/load-env-for-vitest-server-suites.md) — full server-suite runs require `dotenv -e .env` before import-time environment validation. References: 3.

## logic-errors/

- [Template drafts need async guards](./logic-errors/template-drafts-need-async-guards.md) — expose the local structure to route-level save/discard guards and refetch persisted turns for every authoring terminal path. `#templates #drafts #navigation #sse`
- [Forked JSON structures need deep cloning](./logic-errors/forked-json-structure-needs-deep-clone.md) — normalized outer objects can still alias nested template data; deep-clone forked structures and test mutation isolation. `#templates #json #fork`
- [Drift must be emitted on gateway edits](./logic-errors/drift-must-be-emitted-on-gateway-edit.md) — emit external channel drift when the Discord gateway update arrives; cache comparison alone converges. `#discord #drift #gateway #sse`
- [Between-step abort checks don't bound a hung call inside a step](./logic-errors/between-step-abort-check-doesnt-bound-hung-call.md) — an abort flag polled only at the top of a loop can't stop work already in flight inside one iteration. `#execution-engine #cancellation #timeout`
- [Execution mode is not interaction mode](./logic-errors/execution-mode-is-not-interaction-mode.md) — `planning_only` controls execution eligibility; it must not decide whether a planning tool pauses for user input. `#planning-session #tool-registry #execution-mode #ask-user`
- [Persist before emitting completion](./logic-errors/persist-before-emitting-completion.md) — save terminal planning state before publishing success so reconnects cannot contradict the live SSE event. `#planning-session #persistence #sse #completion-ordering`

## test-failures/

- [Load .env for Vitest server suites](./test-failures/load-env-for-vitest-server-suites.md) — run the root suite through `dotenv -e .env` when imports require validated server environment variables. `#vitest #dotenv #database-url #environment`

## integration-issues/

- [Persisted models survive catalog failure](./integration-issues/persisted-models-survive-catalog-failure.md) — preserve the configured model ID when the OpenRouter catalog is unavailable; metadata is best-effort. `#openrouter #catalog #model-config #fallback`
- [Validate allowlist before catalog fetch](./integration-issues/validate-allowlist-before-catalog-fetch.md) — enforce deployment model membership before optional OpenRouter catalog enrichment. `#openrouter #catalog #allowlist #model-config`

## permissions/

- [Discord role diffs must respect strict hierarchy](./permissions/discord-role-diff-must-respect-hierarchy.md) — compare role permissions structurally and require the bot to be strictly above targeted roles. `#discord #role-hierarchy #diff-engine #permissions`

## design-patterns/

- [Promise.race to add a deadline to an API with no cancellation hook](./design-patterns/promise-race-for-uncancellable-api.md) — race the call against a timer/abort listener and stop waiting; you can't cancel the work, only your wait on it. `#promise-race #cancellation #abort-signal`
- [Combine message-matching and error subclasses for retry classification](./design-patterns/error-subclass-vs-message-matching-for-retry-classification.md) — use message-matching for fuzzy "retry like this" behavior, `instanceof` subclasses for hard invariants that must never depend on message wording. `#error-handling #retry #classification`
- [Distinguish absent policy from unavailable validation](./design-patterns/distinguish-absent-policy-from-unavailable-validation.md) — skip validation only when no policy exists; block when configured policy cannot be evaluated. `#fail-closed #policy-validation #availability`

## tooling-decisions/

- [Run PlantUML headlessly during Pandoc DOCX conversion](./tooling-decisions/pandoc-plantuml-headless-java.md) — set Java headless mode when PlantUML runs without an X11 display. `#pandoc #plantuml #docx #java #headless`
- [Use pnpm dlx instead of npx for MCP servers](./tooling-decisions/use-pnpm-dlx-instead-of-npx-for-mcp-servers.md) — `npx` unavailable in pnpm-only envs; use `pnpm dlx` as drop-in replacement. `#opencode #mcp #npx #pnpm`
