# Template & Guidance System

## Templates

Templates are creator-owned global structures injected into the system prompt as
full structured JSON reference layouts. They are not tied to a Discord server and are not conversation
starters that replace the initial DesiredState. Server Studio can use a template as
conversation context; Template Studio edits the reusable structure itself.

### Storage

The `templates` table stores the current materialized structure and metadata:

- id, name, description, version, author_id
- structure (roles, categories, channels with symbols and overwrites)
- validation_rules, category, tags, is_official, status
- created_at, updated_at

Only the authenticated creator can list, read, edit, fork, revert, or delete a
template. Non-owned resources are returned as not found. Templates have no guild
ownership.

`template_versions` stores immutable structural snapshots with their version number,
source (`initial`, `manual`, `ai`, or `revert`), optional authoring-turn ID, and
creation time. `template_authoring_turns` stores creator-scoped natural-language
authoring prompts, cumulative provider messages, status, summary/error, and timing.
Metadata updates do not create a structural version.

### Canonical Routes

The web routes are:

- `/templates` — creator's global library
- `/templates/:templateId` — read-only viewer
- `/templates/:templateId/studio` — dedicated Template Studio

The API lifecycle is under `/api/templates`: list/search, blank or seeded creation,
metadata update, delete, fork, immutable version listing/reading, manual save, and
revert. Guild-scoped reads remain a creator-filtered compatibility alias for Server
Studio. The retired merge endpoint returns `410 Gone`.

### Library and Viewer

The library supports search, blank creation, viewer navigation, immediate fork, and
immediate delete. Fork creates an independent version 1 named `Fork of <name>` and
navigates to its Template Studio. The viewer is read-only and shows metadata, the
current version, category/channel hierarchy, and roles, with creator-only actions
for editing, forking, and deleting.

### Server Studio Context

In Server Studio, `TemplatePanel` and `TemplatesTab` let the user attach or detach a
template from the conversation context. Its full structure is included in the planning
prompt as an adaptable reference baseline. The server loads the current
creator-owned template by ID rather than accepting template content from the client.
Before a conversation exists, `TemplatesTab` holds selected templates as local pending
context; the next submitted prompt sends their IDs when it creates the conversation.
No empty conversation is created for template selection.
The context actions are explicitly
`Use` and `Stop using`; they do not execute Discord changes or start a template
merge flow.

### Template Studio Authoring

Template Studio provides a shared natural-language composer and a live structure
preview. Each prompt starts a creator-scoped planning-only authoring session. The
session can mutate an in-memory DesiredState using category, channel, role,
permission-overwrite, and `ask_user` tools. It has no Discord execution context,
guild state, member-role tools, plan approval, or execution tools.

Successful AI authoring auto-commits exactly one `ai` version when the final
structure changed; unchanged turns create no redundant version. Failed or cancelled
turns leave the current version unchanged. Authoring turns and terminal SSE state
are persisted so completed history remains available after refresh or restart.

Direct structure editing is explicit: `Edit structure` creates a local draft,
`Save structure` creates one `manual` version, and `Cancel` discards the draft.
Navigation, version selection, revert, AI authoring, and refreshed server data are
guarded while a local draft is dirty.

Selecting a historical version previews its immutable snapshot read-only. Reverting
copies that snapshot into a new highest-numbered `revert` version; it never rewrites
or removes newer history. There is no AI review or approval gate.

### Template-to-LLM Flow

1. Server Studio attaches a template to existing conversation context, or holds it as
   pending context until the next prompt creates a conversation.
2. The server loads the authenticated creator's current template record.
3. The system prompt includes its full structure as delimited JSON reference data.
4. The LLM receives server state, template context, tool definitions, and the user prompt.
5. Template Studio authoring instead starts from the current template structure and
   commits only through the immutable template-version service.

---

## LLM Guidance System

Guidance encodes reasoning: how and why to create things. It complements templates,
which describe reusable structure. Static instructions live in
`apps/server/src/prompts/shared-core.md`, `server-planner.md`, and
`template-authoring.md`. They are loaded once when their module is imported and composed
with delimited dynamic context by the planning sessions. Configured server rules are
also loaded and revalidated by planning. Intent-matched guidance remains future work.

### Example Server-Specific Guidance

```text
Server: Naming conventions
Guidance: "Channel names should be descriptive and self-explanatory."
```

### Storage

Configured server rules are persisted in the database. A future intent-matching layer
may evolve separately if dynamic guidance selection is needed.
