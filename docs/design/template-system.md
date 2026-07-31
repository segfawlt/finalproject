# Template & Guidance System

## Templates

Templates are **reference layouts** injected into the system prompt as ideas for
the LLM. They are NOT conversation-starters that load as the initial DesiredState.
Think of them like context files in Cursor or Copilot — the LLM sees them as
available inspiration, not a mandatory merge target.

### Storage

Stored as JSONB in PostgreSQL with metadata (unchanged from original design):

- id, name, description, version, author_id
- structure (roles, categories, channels with symbols and overwrites)
- validation_rules
- category, tags, is_official, status
- guildId — templates are **per-server**, not global

### Template Format (unchanged)

```json
{
  "id": "gaming_tournament",
  "name": "Gaming Tournament Server",
  "description": "Team-based tournament layout",
  "tags": ["gaming", "tournament", "teams"],
  "structure": {
    "roles": [
      { "symbol": "$role_organizer", "name": "Organizer", "permissions": ["MANAGE_CHANNELS"] }
    ],
    "categories": [{ "symbol": "$cat_general", "name": "General", "position": 0 }],
    "channels": [
      { "symbol": "$ch_rules", "name": "rules", "type": "text", "parent": "$cat_general" }
    ]
  }
}
```

### Template Library

Per-server library browsable from the Studio's `TemplatesTab` (right panel)
and the standalone `/templates/:guildId` page:

- Browse by tags, search by name/description
- Card preview for each template (name, description, tags, structure tree)
- Detail page (read-only, shows structure as visual tree)

### Three Levels of Template Usage

Templates interact with the LLM at three levels — all via the system prompt:

```
Level 1: Passive ideas
  User opens template sidebar in a conversation → clicks "Add to context"
  Template summary injected into system prompt as:
    "Available template layouts for inspiration:
     - Gaming Tournament: 4 team categories, roles for organizer/player..."
  LLM sees these as ideas; may or may not use them
  No explicit prompt — the template is just additional context

Level 2: User asks to merge
  User types: "merge the gaming template into our server"
  LLM receives same template context + explicit merge instruction from user
  Standard planning loop handles it — LLM adapts template to existing structure

Level 3: Merge button
  "Merge Template" button next to active templates in the sidebar
  Sends a crafted prompt via revise:
    "Merge the '{templateName}' template into the current server configuration.
     Adapt it to fit existing channels and roles. Do not delete anything unless
     it clearly conflicts with the template's intent."
  More reliable than relying on user to craft a good merge prompt
```

### View, Fork & Edit Flow

```
Template Library / Template List Sidebar
  │
  ├─ [View in Studio] — accessible anywhere (library, sidebar, detail page)
  │     Opens a read-only Studio view of the template (layout preview only)
  │
  └─ [Fork & Edit] — also accessible anywhere
        Creates a new template entry immediately: "Fork of Gaming Tournament"
        Opens an editable Studio loaded with the forked template as DesiredState
        │
        ├─ All edits are auto-saved via DesiredStateStore snapshots
        │   (same pattern as conversation iterations)
        │
        ├─ [Revert] — rewinds to the fork point (original template content)
        │
        ├─ [Discard] — deletes the forked template entry entirely
        │
        └─ Close/switch — work is preserved via auto-save, no explicit save needed
```

Naming: "Fork of Gaming Tournament" → "Fork of Gaming Tournament (2)" on collision.

### Template-to-LLM Flow

1. User adds template to conversation context via sidebar
2. System injects template summary into system prompt as JSON structure section
3. LLM receives: server state + template summaries + tool definitions + user prompt
4. LLM uses templates as reference when relevant; no forced merge

### Template Authoring

- Phase 1 (now): JSON editor in web app
- Phase 2 (later): Visual template builder via Fork & Edit in Studio
- Phase 3 (community): Submission + review flow

---

## LLM Guidance System

Guidance encodes **reasoning** — HOW and WHY to create things. Best practices
knowledge loaded into the planning prompt.

Complements templates: templates = WHAT (structure), guidance = HOW/WHY (reasoning).

### How It Works (Phase 2)

- Guidance files are Markdown documents with best practices for common scenarios
- During planning, the system matches user intent to relevant guidance files
- Loaded into planning prompt as context
- Always applied (system-driven), unlike templates (user-chosen)
- Fills gaps when no template matches

### Example

```
Action: "Create staff space"
Guidance:
  - Create a private category
  - Find existing roles with MANAGE_SERVER/ADMINISTRATOR, add to category
  - Create channels: #staff-chat, #mod-logs (minimum)
  - @everyone -view on category
  - Suggest audit log channel if none exists
  - If server <50 members, skip #admin-only
```

### Example Server-Specific Guidance

```
Server: NSFW policy
Guidance: "Never create NSFW or age-restricted channels."

Server: Naming conventions
Guidance: "Channel names should be descriptive and self-explanatory.
  Prefer 'community-help-desk' over 'help'. Keep category names under 20 chars."
```

### Current State (Phase 1)

Hardcoded rules in `buildSystemPrompt()` cover the basics. The guidance system
(Phase 2) replaces these with file-based, intent-matched guidance that supports
server-specific customization.

### Storage

Markdown files. Can evolve into database entries if dynamic updates needed.
