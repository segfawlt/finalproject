# Template Library And Studio UI Design

## Goal

Make template browsing easier to scan, remove irrelevant conversation history from template
routes, align both side-panel toggles with their respective panel edges, and make Template Studio
feel like the server Studio while preserving its template-only versioning and authoring behavior.

## Approaches Considered

1. Cosmetic refresh: retain the current list and Template Studio layout, changing only spacing and
   button styles. This is small, but does not make templates easier to compare or address the
   different authoring hierarchy.
2. Two-column template editor: combine version history and authoring on the left, with the
   structure preview on the right. This creates a focused editor but diverges from the Studio
   interaction model the user already knows.
3. Shared three-column authoring shell: retain version history on the left, place authoring turns
   and a floating composer in the center, and show the editable structure preview on the right.
   This is the selected approach because it preserves the existing routes and behavior while
   establishing a uniform interaction model.

## Scope

### Shared Panel Controls

StudioShell will render each visible panel's collapse control on the outer edge of that panel:

- The left navigation control sits flush at the left outer edge.
- The right preview control sits flush at the right outer edge.
- When a panel is hidden, its restore control remains on that same viewport edge.
- The controls use matching dimensions, surface treatment, hover state, and centered vertical
  placement. Resize separators and keyboard behavior are unchanged.

### Template Navigation

WorkspaceSidebar gains a template-route mode rather than inferring this from the missing guild ID.
In this mode it does not request, render, or reserve space for recent conversations.

- Template Library shows the standard product navigation and account footer only.
- Template Studio shows the same navigation plus its existing Version history context.
- The New chat action remains available and returns to the retained server Studio, so it does not
  become a template-specific action.

### Template Library

The library becomes a responsive card grid: one column on small screens, two at medium widths, and
three when the content column allows it. Each card links to the canonical viewer route and shows:

- Name, description, and optional category/tags.
- Channel and role counts derived from the materialized template structure.
- Current version and last-updated date.

The existing search continues to match name, description, and category. The current list response
already supplies description; it will additionally provide structure and updatedAt so the browser
can calculate counts and dates without a new endpoint. Empty, loading, and no-results states stay
in place. Blank templates start with an empty description, editable in Template Studio.

### Template Viewer

The viewer displays the template description directly below its title, before its version and
updated metadata. This makes descriptions visible both while browsing and after opening a template.

### Template Studio

Template Studio remains a three-column StudioShell:

- Left: template navigation and immutable version history only, with no conversation history.
- Center: authoring-turn cards styled as Studio assistant/user activity, an inline ask-user card,
  error state, and a docked floating composer matching the server Studio's visual hierarchy. The
  composer submits natural-language template changes and exposes cancellation while a turn is
  active.
- Right: the existing editable structure preview, with current/historical version indication and
  existing explicit edit/save controls.

The header becomes a compact Studio-style contextual header: back to the template viewer, editable
name and description, current version, then save, fork, and delete actions. Metadata saves remain
explicit; local draft changes still mark the editor dirty.

The existing asynchronous draft guard remains the single gate for navigation, version selection,
revert, authoring refresh, fork, and deletion. It continues to offer save, discard, or stay before
an action can replace or abandon a structure draft.

## Data And Error Handling

No database migration is required. Template `description` already exists and is validated by the
existing create and metadata-update routes. The list endpoint continues creator scoping and adds no
new authorization surface.

Failed library fetches retain the current empty fallback. Template Studio continues to surface
authoring and refresh errors in the center pane. Failed metadata or structure saves retain the
current error path; this work must avoid silently clearing dirty state.

## Tests

- Extend StudioShell component tests to verify collapse/restore controls remain on the matching
  outer panel edge and retain their accessible labels.
- Extend Template Library tests for description, structure counts, metadata display, and card-grid
  navigation.
- Extend WorkspaceSidebar tests to verify template mode neither fetches nor displays recent
  conversations, while version-history children remain visible.
- Extend Template Studio tests for the Studio-style authoring center and preservation of the draft
  guard around a destructive/navigation action.

## Acceptance Criteria

- Both side-panel controls are visually symmetric and attached to their own outer edges.
- Template routes never show or fetch recent conversations.
- Library cards make template contents and purpose scannable through descriptions and counts.
- Template descriptions are visible in the library, viewer, and editable Studio header.
- Template Studio retains version history, authoring, editable preview, manual save, AI authoring,
  historical preview, and unsaved-draft protection in a coherent three-column layout.
