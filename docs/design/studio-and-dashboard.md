# Studio & Dashboard

## Studio (Web Clone — Primary Interface)

A React-based Discord-like UI focused on server configuration (not messaging). Client-side SPA (Vite + React), no SSR needed.

There is only **one mode — Plan Mode.** The user types a prompt, the LLM builds the desired state, and the Discord clone renders it with visual diff highlighting (green = new, red = deleted). The user decides depth: click Approve immediately for quick execution, or iterate with more prompts and manual edits before approving.

### Plan Preview

The Discord clone IS the plan preview. As the LLM calls tools, the desired state updates
and the clone re-renders. User sees changes accumulate live. No separate preview panel needed.

During planning, the conversation UI shows:

- **Thinking block** — collapsed `<details>` by default. LLM reasoning text shown when expanded.
- **Tool call list** — live as tools are dispatched (tool name + params + result symbol)
- **Answer text** — streamed after all tool calls complete (or shown at once)

### Template Sidebar

A toggleable sidebar within the Studio shows the per-server template library:

- Browse/search templates by name, description, tags
- Card preview for each template
- **"Add to context"** button — only visible when a conversation is active
  Injects the template summary into the system prompt as "Available ideas"
- **"Merge Template"** button — sends a crafted merge prompt via `revise`
- **"View in Studio"** — opens the template in a read-only Studio view
- **"Fork & Edit"** — creates a copy, opens editable Studio with auto-save

### View in Studio (Template Viewer)

Read-only Studio view accessible from the template library, sidebar, or detail page:

- Shows the template layout as a Discord clone (channels, categories, roles)
- No editing — view only
- **[Fork & Edit]** button → creates a new template entry, opens editable mode
- **[Add to context]** button → adds to active conversation's system prompt

### Fork & Edit (Template Editor)

When the user forks a template into an editable Studio:

- A new template entry is created immediately: "Fork of {template name}"
- Edits are auto-saved via the DesiredStateStore snapshot pattern (same as conversations)
- **[Revert]** rewinds to the fork point (original template content)
- **[Discard]** deletes the forked entry entirely
- **[Save as]** allows renaming the forked template
- No explicit save needed — closing the tab preserves work

### Manual Editing (Limited)

Users can:

- Rename items
- Reorder channels/categories
- Delete proposed changes
- Edit role colors, hoist, mentionable
- Toggle overwrites

**Blocked:** Structural edits (moving a channel to a different category). These require a Revise prompt to maintain LLM intent coherence. Manual edits do NOT trigger automatic LLM revision.

### Iteration History

Each user prompt or manual edit creates an iteration snapshot — a versioned checkpoint of the desired state. Iterations are persisted to the `plan_iterations` table in the database, surviving server restarts. The current DesiredState displayed in Studio is the latest iteration for the active conversation. Reverting creates a new iteration that copies the old one's state — nothing is deleted. Git-like versioning within a conversation.

#### Diff Tabs

Iterations are compared via IDE-style diff tabs:

- **Default view**: Single panel showing the current DesiredState
- **History**: Accessible via dropdown or timeline sidebar
- **Clicking an iteration** opens it as a diff tab next to the current state
- Multiple tabs can be open simultaneously (compare any two iterations)
- Each tab shows a green/red diff against the current state:
  - Green = item added since that iteration
  - Red = item removed since that iteration
- Each tab has a **[Revert to this]** button
- Tabs can be opened, rearranged, and closed like browser tabs

### Approval

- **[Approve]**: Triggers diff engine → validation → execution on Discord
- **[Revise]**: Opens a prompt input for the next iteration
- Single button. No mode toggle.

### Execution View

During execution, the clone shows real-time status:

- Completed steps rendered in green
- In-progress with spinner
- Pending greyed out

Progress tracked via SSE stream (`GET /api/plan/:id/stream`).

### Rollback

After execution, each plan has a [Rollback] button. Generates inverse plan from before-snapshot and executes.

### What Studio Does NOT Need

- Message rendering, voice audio, screen sharing, video calls
- Emoji picker, sticker system, Nitro features, activity integration
- It is a **configuration UI**, not a full Discord messaging experience

### State Management

Zustand for all UI state:

- DesiredState (rendered in clone)
- Iteration history
- Active templates (template IDs currently in context for the conversation)
- Panel sync (left/right panels)
- Execution progress
- Multi-select (for scoped revision)
- Drag state

Data fetching via manual `fetch` calls (~15 endpoints).

---

## Dashboard (Supplementary)

Reduced scope — plan history and basic management:

- Plan history + rollback
- Server rules management (CRUD)
- Basic bot settings (intents, permissions, preview server)
- Basic stats (plans run, success rate)

**Deferred (not Phase 1):**

- Full admin management tool
- Subscription/billing
- Detailed audit logs
- Template library management (Phase 1: JSON editor only)
- User management
