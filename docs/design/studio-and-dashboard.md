# Studio & Dashboard

## Studio (Chat-Native Web Clone)

The React SPA is a Discord-like configuration UI, not a messaging client. Server
Studio lets the user describe a server change in natural language, inspect the
declarative desired state, revise it, and approve execution.

Server Studio and Template Studio share a three-column shell:

```text
┌──────────────────────────────────────────────────────────────┐
│ Contextual header: route identity and panel controls         │
├──────────────┬────────────────────────┬──────────────────────┤
│ Workspace    │ Route content          │ Server/template       │
│ navigation   │ chat or authoring      │ preview               │
│ + history    │ composer and transcript│                      │
└──────────────┴────────────────────────┴──────────────────────┘
```

### Persistent Workspace Navigation

`WorkspaceSidebar` is shared across Studio routes. It contains product navigation,
an active-state `Studio` link, a `Templates` link, and a prominent `New chat` action.
For an active server it loads `Recent conversations`, grouped as Today, Yesterday,
and Earlier. Without an active server it keeps the section heading and shows an
empty state rather than using another guild's history.

The active server identity is pinned in the footer and opens the server picker.
Authenticated account access and sign-out remain in that footer area. The active
server selection is retained locally so New chat can return to its fresh composer.

### Shared Resizable Shell

The left navigation and right preview panels resize independently through draggable,
keyboard-accessible separators. Each width is clamped so the flexible center remains
usable. Each panel also has its own hide/show control; hiding removes its column,
while a restore control remains in the center header. Double-clicking a separator
restores that panel's default width.

Panel widths and visibility are persisted in `localStorage` under the shared Studio
shell key. Invalid stored preferences fall back to defaults. On narrow screens,
separators are disabled and the panels become independent route-appropriate overlays;
desktop preferences are retained for later desktop use.

### Server Studio Content

The center chat area shows the welcome state or a conversation transcript with user,
assistant planning, `ask_user`, completed, executing, executed, and failure states.
The shared composer starts a fresh conversation or revises a ready plan. The right
panel contains the current Server view, desired-state diff, channel details, roles,
members, and template context tabs.

When a plan is ready, Approve executes it unless drift has made the plan stale. Edit
creates a manual desired-state iteration and Cancel stops planning. Execution offers
Rollback or New plan. Iteration history is available in a modal, and external Discord
changes appear through the drift indicator with a Re-fork action.

### Templates in Server Studio

`TemplatesTab` browses the creator's available global templates with search and
structure counts. `Use` and `Stop using` attach or detach conversation context, and
links point to the canonical template viewer. `TemplatePanel` provides the same
in-conversation context management. No Merge action is presented.

## Template Studio

Template Studio is at `/templates/:templateId/studio`. It uses the same persistent
workspace navigation and independent shell panels. The center contains template
metadata, the natural-language authoring transcript, status/error messages, and the
composer. The right panel shows the live category/channel and role structure.

Natural-language authoring is planning-only and auto-commits a changed result as one
immutable AI version. It cannot execute against Discord. Direct structure editing is
explicit: edit creates a local draft, Save structure creates one manual version, and
Cancel discards it. Historical versions are read-only previews; Revert creates a new
revert version. Dirty drafts block actions that would replace them until the user
saves, discards, or stays.

The global library is `/templates` and the read-only viewer is
`/templates/:templateId`. The viewer supports creator-only Edit in Template Studio,
Fork, and Delete actions. Blank creation, fork, metadata editing, version history,
and immediate deletion are global template lifecycle operations.

## Settings

Server rules and deployment model configuration are available through the Studio
settings dialog. Plan history and rollback are reached from the conversation's
iteration history.

## Deferred

- Full admin management tool
- Subscription/billing
- Detailed audit logs
- User management
- File-based, intent-matched guidance

The standalone `Dashboard.tsx` and `Setup.tsx` pages are retired and unrouted. Their
files remain on disk, while `/dashboard` and `/setup` redirect to `/studio`.
