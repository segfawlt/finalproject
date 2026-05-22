# Studio & Dashboard

## Studio (Web Clone — Primary Interface)

A React-based Discord-like UI focused on server configuration (not messaging). Client-side SPA (Vite + React), no SSR needed.

There is only **one mode — Plan Mode.** The user types a prompt, the LLM builds the desired state, and the Discord clone renders it with visual diff highlighting (green = new, red = deleted). The user decides depth: click Approve immediately for quick execution, or iterate with more prompts and manual edits before approving.

### Plan Preview

The Discord clone IS the plan preview. As the LLM calls tools, the desired state updates and the clone re-renders. User sees changes accumulate live. No separate preview panel needed.

### Manual Editing (Limited)

Users can:
- Rename items
- Reorder channels/categories
- Delete proposed changes
- Edit role colors, hoist, mentionable
- Toggle overwrites

**Blocked:** Structural edits (moving a channel to a different category). These require a Revise prompt to maintain LLM intent coherence. Manual edits do NOT trigger automatic LLM revision.

### Iteration History

Each user prompt or manual edit creates an iteration snapshot — a versioned checkpoint of the desired state. Iterations live in memory during planning (fast, zero DB overhead) and are persisted to the `plan_iterations` table at approval. Reverting creates a new iteration that copies the old one's state — nothing is deleted. Git-like versioning within a plan.

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
