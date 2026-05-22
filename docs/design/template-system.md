# Template & Guidance System

## Templates

Templates encode **structure** — WHAT to create. A library of pre-built server layouts that users can browse, apply, and adapt.

### Storage

Stored as JSONB in PostgreSQL with metadata:
- id, name, description, version, author_id
- structure (roles, categories, channels with symbols and overwrites)
- questions (dynamic parameters like team_count)
- validation_rules
- category, tags, is_official, status

### Template Format

```json
{
  "id": "gaming_tournament",
  "name": "Gaming Tournament Server",
  "description": "Team-based tournament layout",
  "tags": ["gaming", "tournament", "teams"],
  "questions": [
    { "key": "team_count", "type": "number", "prompt": "How many teams?", "min": 2, "max": 32 }
  ],
  "structure": {
    "roles": [{ "symbol": "$role_organizer", "name": "Organizer", "permissions": ["MANAGE_CHANNELS"] }],
    "categories": [{ "symbol": "$cat_general", "name": "General", "position": 0 }],
    "channels": [{ "symbol": "$ch_rules", "name": "rules", "type": "text", "parent": "$cat_general" }]
  }
}
```

- Dynamic naming via `{{variable}}` template syntax
- Repeated structures via `"repeat": "team_count"`
- Symbols resolved by execution engine

### Template Library

- Browse by tags, search by name/description
- Detail page (read-only, shows structure as visual tree)
- "Add to Studio" → template data loaded as starting state
- User edits in Studio using same editing UI

### Template-to-LLM Flow

1. Template added to Studio
2. System passes structured JSON summary to LLM
3. LLM compares template vs current server state
4. LLM generates merge plan — adapts, doesn't blindly copy

### Template Authoring

- Phase 1 (now): JSON editor in web app
- Phase 2 (later): Visual template builder in Studio (drag-and-drop)
- Phase 3 (community): Submission + review flow

---

## LLM Guidance System

Guidance encodes **reasoning** — HOW and WHY to create things. Best practices knowledge loaded into the planning prompt.

Complements templates: templates = WHAT (structure), guidance = HOW/WHY (reasoning).

### How It Works

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

### Storage

Markdown files. Can evolve into database entries if dynamic updates needed.
