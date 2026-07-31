# Studio & Dashboard

## Studio (Chat-Native Web Clone)

A React-based Discord-like UI focused on server configuration (not messaging).
Client-side SPA (Vite + React), no SSR needed.

The Studio is built around a **chat-native** layout: a collapsible history
sidebar on the left, a chat area in the middle, and a tabbed preview panel
on the right. The user types a prompt, the LLM builds the desired state, and
the Discord clone in the right panel updates live. The user decides depth:
click Approve immediately for quick execution, or iterate with more
prompts and manual edits before approving.

### Layout (3-column)

```
┌──────────────────────────────────────────────────────────────┐
│ Top header: guild name, back-to-picker, Templates / Settings │
├──────────┬──────────────────────────┬─────────────────────────┤
│ History  │  Chat conversation       │ Right panel (tabs):     │
│ sidebar  │                          │ [Server][Desired][+...]  │
│ (collapse│  Welcome OR messages     │                         │
│ -ible)   │  + docked input          │  Closable tabs:         │
│          │                          │  Channel detail, Roles, │
│ [+ New   │  Inline action buttons   │  Members, Templates,    │
│   chat]  │  on the assistant's      │  Drift                  │
│          │  final message.          │                         │
│ Today    │                          │  (overflow › if many)    │
│ ── conv1 │                          │                         │
└──────────┴──────────────────────────┴─────────────────────────┘
```

- The **history sidebar** (`ConversationSidebar`) lists past conversations
  grouped by Today / Yesterday / Earlier, with a New Chat button at the top.
- The **chat area** (`ChatArea`) renders the conversation as a stream of
  bubbles: user prompt (right-aligned accent), assistant planning bubble
  (with a collapsed planning log), ask_user bubble (with options + custom
  input), completed bubble (summary + DesiredStateView + inline Approve /
  Edit / Cancel actions), executing bubble (live step log), executed
  bubble (Rollback / New plan), execute_failed bubble. A Revise input is
  docked at the bottom when the plan is ready.
- The **right panel** (`RightPanel`) is a VSCode-style tab system. The
  Server tab is always present and shows the current Discord state. The
  Desired tab appears when the active conversation has produced a desired
  state. The "+" popover adds closable tabs (Roles, Members, Templates).
  Clicking a channel in the Server tab opens a `channel:<id>` tab with the
  channel detail (settings + permission overwrites table).

### Welcome state

When there's no active conversation, the chat area shows `WelcomeScreen`:
curated suggestion cards (staff channels, gaming layout, foundational
roles, channel permission fix, audit) plus a freeform textarea. Clicking a
suggestion or sending custom text calls `createConversation(prompt)`.

### Plan Preview

The right panel's Desired tab is the live preview. The Discord clone
renders categories / channels / roles with visual diff highlighting
against the current Discord state. The user can click into any channel
to see its full settings + permission overwrites.

During planning, the chat shows:

- **Planning bubble** with a left-border accent and a collapsed
  `<details>` listing every tool call as it streams in. The bubble label
  is "Planning…" while the LLM thinks, "Planned" after completion.

### Inline actions (Cursor-style)

When the plan is ready, the assistant's "Plan ready" bubble carries
inline action buttons at the bottom:

- **Approve** — executes the plan. Disabled when the server has changed
  externally since planning started (drift lockout, see below).
- **Edit** — enters the manual-edit mode (inline inputs on the desired
  state rows).
- **Cancel** — cancels the planning session.

When execution finishes, the "Execution complete" bubble carries
**Rollback** and **New plan**. The execute_failed bubble carries a
**Start over** button.

The docked Revise input at the bottom of the chat area is always present
when the plan is ready. Sending a new prompt there continues the
conversation with a new iteration.

### Iteration history popout

A small "History (N)" button in the chat toolbar opens
`IterationHistoryModal` — a focused modal with a vertical timeline of
every iteration (version, type badge, timestamp). Click an iteration to
preview its DesiredState, Revert to make it current, or close the modal.

### Drift detection

The studio subscribes to `/api/guilds/:guildId/drift/stream`. When the
server changes externally (e.g. someone edits Discord directly), a
`DriftIndicator` toast surfaces in the top-right with a "Re-fork" button
and flips a per-guild `stale` flag in the store. While `stale` is true, the
Approve button is disabled (with a tooltip) and the server enforces the
same on its end (returns 409 on stale approve).

### Manual edit mode

When the user clicks Edit on the completed bubble, the DesiredStateView
swaps read-only rows for inline inputs. Save posts to
`/conversations/:id/edit-state` and re-fetches the iteration list (a new
"manual_edit" iteration is appended). Cancel discards the working copy.

## Templates

Templates are browsable in three places, all backed by the same API:

- **`TemplatesTab`** — a real in-panel browser in the Studio right panel
  (closable tab). Lists templates with search, channel/role counts, and a
  Merge button that injects the template's structure into the current
  desired state. Save-as-template from a completed plan lives here too
  (`SaveTemplateModal`).
- **`TemplatePanel`** — the in-conversation toolbar UI for in-context
  template injection: browse, add to context, remove.
- **`/templates/:guildId`** (`routes/Templates.tsx`) + editor
  (`routes/TemplateEditor.tsx`) — the standalone library page, with an
  editable template structure in the editor (Fork & Edit, Save).

## Settings

Server settings live in the Studio right panel via `SettingsTab` (closable
tab), not a separate Dashboard:

- Server rules management (per-guild CRUD via `/api/guilds/:guildId/rules`)
- Basic bot settings (intents, permissions, preview server)

Plan history + rollback is reachable from the chat's iteration history.

**Deferred (not Phase 1):**

- Full admin management tool
- Subscription/billing
- Detailed audit logs
- User management

> The standalone `Dashboard.tsx` and `Setup.tsx` pages were retired during
> the Studio consolidation — the files remain on disk (stashed, unrouted)
> and `/dashboard` + `/setup` redirect to `/studio`.
