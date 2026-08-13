# Global Template Studio and Resizable Studio Shell Design

## Goal

Build a creator-owned global template lifecycle with natural-language AI authoring, direct
structure editing, and immutable version history. At the same time, give Server Studio and
Template Studio one shared application shell with persistent navigation and independently
resizable, hideable side panels.

## Scope

This design covers:

- A creator-only global template library, viewer, and Template Studio.
- Blank-template creation, fork, metadata editing, immediate deletion, and structural versions.
- Natural-language AI turns that mutate template state without touching Discord.
- A shared left application sidebar and right context panel for both Studio experiences.
- Independent resizing, hiding, restoring, and local persistence for both side panels.

This design does not add public template discovery, sharing, publishing, approval before AI
changes, or Discord execution from Template Studio.

## Routes and Navigation

The canonical web routes are:

| Route                           | Purpose                              |
| ------------------------------- | ------------------------------------ |
| `/studio`                       | Server picker and fresh Studio entry |
| `/studio/:guildId`              | Server Studio for the active guild   |
| `/templates`                    | Creator's global template library    |
| `/templates/:templateId`        | Read-only template viewer            |
| `/templates/:templateId/studio` | Dedicated Template Studio            |

Existing non-canonical template URLs redirect to the matching canonical route where the target
can be determined. The route table must place specific viewer and Studio routes before any
legacy parameterized redirects.

The persistent left sidebar contains, in order:

1. Product identity.
2. A prominent `New chat` action.
3. Large `Studio` and `Templates` route entries with an active state.
4. A `Recent conversations` section for the active server.
5. The active server identity pinned to the bottom-left, with authenticated account/sign-out
   access retained in the same footer area.

`New chat` navigates to the fresh composer for the active server. If no server is active, it
navigates to `/studio` so the user can select one. Recent conversations are shown only when an
active server is known; routes without an active server retain the section heading with an empty
state rather than borrowing conversations from another guild. The server identity opens the
server picker at `/studio`.

## Shared Resizable Shell

Server Studio and Template Studio use the same three-column shell:

- Left: persistent application navigation and recent conversations.
- Center: flexible route content (`minmax(0, 1fr)`).
- Right: Server Studio state preview or Template Studio structure preview.

The left and right columns each have a draggable separator. Resizing changes only that side's
pixel width; the center consumes the remaining space. Widths are constrained so neither side can
make the center unusable. Initial desktop widths favor the wider right preview selected in the
approved mockup.

Panel behavior:

- Each side has its own hide/show control; no control toggles both panels.
- Hiding a panel removes its column and separator rather than rendering a narrow collapsed rail.
- A left-panel restore control remains in the center header when the left side is hidden.
- A right-panel restore control remains in the center header when the right side is hidden.
- Double-clicking a separator restores that panel's default width.
- Width and visibility are persisted in `localStorage` under shared Studio-shell keys.
- Pointer dragging is clamped to configured minimum and maximum widths.
- Keyboard users can focus a separator and resize it with arrow keys.
- On narrow screens, draggable separators are disabled and route-appropriate overlay/drawer
  controls replace permanent side columns. Desktop preferences remain unchanged for later use.

The shell owns width and visibility. Child sidebars do not keep a second `collapsed` state. This
removes the current broken hide-panel behavior and prevents shell and child state from diverging.

## Template Ownership and Data Model

Templates are private to their creator. Global list and detail queries always filter by the
authenticated user's ID. A creator may edit, fork, revert, or delete only their own templates.

The existing `templates.structure` remains the current materialized structure for efficient list
and detail reads. `templates.version` is the current structural version number. Metadata-only
updates change `updatedAt` but do not increment this number.

Add `template_versions` with:

- `id`: UUID primary key.
- `templateId`: owning template, cascade-deleted with it.
- `version`: monotonically increasing integer unique within the template.
- `structure`: immutable JSONB snapshot.
- `source`: `initial`, `manual`, `ai`, or `revert`.
- `authoringTurnId`: optional reference identifying the AI turn that produced the version.
- `createdAt`: creation timestamp.

Add `template_authoring_turns` with the template and creator IDs, prompt, base template version,
provider-message audit log, status (`planning`, `waiting_for_user`, `completed`, `cancelled`, or
`error`), summary/error, and timestamps. `template_versions.authoringTurnId` references this table
when the version came from AI authoring. These rows make the transcript and terminal state
recoverable after refresh or server restart; active in-memory provider calls are still
interrupted by restart.

Blank creation, creation from a completed Server Studio plan, and fork all create template version
1 in the same database transaction as the template row. Existing templates are backfilled with
version 1 from their current structure.

A version row is never updated. Revert copies the selected historical structure into a new
highest-numbered version and updates the template's materialized structure. It never moves a
pointer backward or deletes newer history.

## Global Template API

Canonical endpoints under `/api/templates` provide:

- List and search the authenticated creator's templates.
- Create a blank template or seed version 1 from a completed Server Studio plan.
- Read one creator-owned template.
- Update metadata without creating a structural version.
- Save a manual structure as one new version.
- Fork a template as `Fork of <name>` and create its independent version 1.
- Delete a template and its versions immediately.
- List immutable versions.
- Read one version.
- Revert by creating a new version from an old snapshot.

Route-level authorization is creator-only even in the current single-user deployment. Unknown
and non-owned template IDs return `404` to avoid exposing their existence. Structural writes use
a transaction that locks or conditionally updates the template so concurrent saves cannot create
duplicate version numbers.

Guild-scoped template reads used by Server Studio return only creator-owned templates available
to the authenticated user. Existing `Use` and `Stop using` conversation-context actions remain.
The retired merge endpoint continues returning `410 Gone` and no UI presents a Merge action.

## Template Authoring Session

Template AI authoring uses natural-language prompts and the existing declarative planning tools,
but runs in a dedicated `TemplateSession`. It starts from the template's current DesiredState-like
structure and executes planning tool calls only against an in-memory desired-state store.

The session must not receive a Discord execution context, guild state, plan approval action, or
plan execution tools. Its tool allowlist contains category, channel, role, permission-overwrite,
and `ask_user` operations. Member-role tools are excluded because global templates have no stable
guild member IDs. Its system prompt explicitly describes template authoring and available
structure operations. Existing planning-loop mechanics may be reused where their contracts fit:

- OpenRouter request and stream parsing.
- Planning tool definitions and argument validation.
- `ask_user` pause/resume behavior.
- Cancellation.
- SSE event conventions.
- Persistence before terminal completion events.

One submitted user prompt is one authoring turn. The session may make multiple tool calls within
that turn. On successful completion, it commits exactly one `ai` structural version containing
the final state, even if multiple tools ran. If the final structure is unchanged, the turn is
recorded in conversation output but no redundant structural version is created. Failed or
cancelled turns create no version.

Each new turn starts from the current template version and the latest persisted cumulative
authoring messages. The turn records that base version. If another structural write lands before
the AI turn completes, its commit fails with a version conflict rather than overwriting the newer
state.

Template sessions are keyed separately from server planning sessions and are scoped to both the
template ID and creator ID. Every start, stream, answer, and cancel endpoint rechecks ownership.

## Template Studio UI

Template Studio uses the approved wide-preview three-column balance:

- Left sidebar: shared application navigation, then template version history in the route's
  contextual section.
- Center: template header, AI authoring transcript, status/error messages, and the shared
  natural-language composer.
- Right: wide live category/channel tree and roles preview with direct editing controls.

The header provides template name, metadata editing, viewer navigation, fork, and immediate
delete. Delete has no confirmation, matching the approved lifecycle.

Manual structure editing is explicit:

1. `Edit structure` creates a local draft from the current version.
2. Draft changes update the right preview immediately but remain client-side.
3. `Save structure` creates exactly one `manual` version.
4. `Cancel` discards the draft.

Starting an AI turn, selecting another version, reverting, navigating away, or accepting a newer
server result while a manual draft exists must not silently discard it. The UI blocks the action
and asks the user to save or cancel the local draft.

Version history lists newest first with number, source, and timestamp. Selecting a historical
version previews it read-only without changing the current template. `Revert to this version`
creates a new `revert` version and returns the preview to the new current version.

An AI completion refreshes the current template and version list, then updates the preview. There
is no review or approval gate: successful AI turns auto-commit.

## Library and Viewer

The global library supports search, blank creation, viewer navigation, fork, and immediate
delete. It contains only the authenticated creator's templates.

The viewer is read-only and displays only:

- Category/channel hierarchy.
- Roles.
- Metadata and current version.
- Edit in Template Studio, fork, and delete actions for the creator.

Fork immediately creates an independent template named `Fork of <name>` and navigates to its
Template Studio. Forked versions do not retain a live link to the source template.

## Error Handling and Recovery

- API validation errors return clear `400` responses.
- Missing or non-owned templates and versions return `404`.
- Concurrent structural updates return `409`; the UI refreshes version history and preserves any
  local manual draft for explicit reconciliation.
- AI provider and tool errors end the turn with an error event and leave the current version
  unchanged.
- SSE reconnects use persisted turn/version state so a terminal UI state never precedes its
  database commit.
- A server restart interrupts active in-memory authoring sessions; persisted completed turns and
  versions remain available.
- Invalid persisted panel preferences fall back to defaults.

## Testing

Database and API tests cover:

- Creator filtering and non-owner `404` behavior.
- Atomic blank creation and fork version 1.
- Metadata updates without version increments.
- Manual, AI, and revert version creation.
- Immutable historical snapshots and concurrent version protection.
- Cascade deletion.

Template-session tests cover natural-language tool turns, multiple tools producing one version,
unchanged turns, `ask_user`, cancellation, provider failure, ownership, and persistence-before-
completion ordering. Tests also prove that no Discord execution context is available.

Web tests cover canonical and legacy navigation, sidebar route actions, independent panel
visibility, resize constraints and persistence, manual draft protection, AI completion refresh,
version preview/revert, fork, and delete.

Repository verification includes focused tests, database migration inspection, `pnpm typecheck`,
`pnpm test:run`, `pnpm lint`, and `pnpm format:check`.

## Success Criteria

- A creator can create, edit, AI-author, inspect versions, revert, fork, and delete a global
  template without selecting a Discord server.
- Every structural commit has immutable history; metadata-only edits do not add history.
- Template authoring cannot execute against Discord.
- Server Studio still supports template `Use` and `Stop using` context actions and exposes no
  Merge action.
- Studio and Template Studio share a persistent navigation sidebar.
- The left and right panels resize and hide independently while the center remains flexible.
- Recent conversations and current server identity appear in the approved sidebar hierarchy.
