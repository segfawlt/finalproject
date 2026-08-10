# Studio UI: Google Stitch Designer Context

## Product Context

Studio is an AI-assisted Discord server configuration workspace for server administrators. It is not a Discord chat replacement and it is not a generic analytics dashboard.

The administrator describes a server change in natural language. The AI plans the change, shows a reviewable desired configuration beside the current Discord configuration, and executes only after explicit human approval. The interface should make that plan-first safety model obvious and trustworthy.

## Current Screen Anatomy

The main Studio screen is a full-height, dark, three-column workspace:

```text
┌─────────────────────────────────────────────────────────────────────┐
│ Header: back / guild identity / Templates / Settings                │
├──────────────┬──────────────────────────┬───────────────────────────┤
│ Conversation │ Chat and planning flow   │ Preview panel              │
│ history      │                          │ [Server] [Desired] [+]     │
│              │ Welcome or messages      │                           │
│ New Chat     │ Docked prompt input      │ Current or desired server  │
│ Today        │                          │ state, diffs, details      │
│ Yesterday    │                          │                           │
│ Earlier      │                          │                           │
└──────────────┴──────────────────────────┴───────────────────────────┘
```

### Left: Conversation history

- Collapsible sidebar.
- `New Chat` action.
- Previous conversations grouped into `Today`, `Yesterday`, and `Earlier`.
- Selecting a conversation restores its planning history and desired state.

### Center: AI planning conversation

- Empty state contains curated suggestions and a freeform request field.
- User prompts appear as conversation messages.
- AI planning shows progress and a collapsible tool-call log.
- The AI may ask a clarification question before producing a plan.
- A completed plan shows a summary and actions: `Approve`, `Edit`, and `Cancel`.
- `Edit` enables inline editing of the desired server state.
- A docked revise field lets the administrator continue iterating.
- Execution shows live step progress, followed by success, failure, rollback, or retry actions.

### Right: Discord-like state preview

- Persistent `Server` tab shows the current Discord state.
- `Desired` tab shows the AI-generated target state and appears when a plan exists.
- Tabs use a VS Code-style interaction model: active tab, closable contextual tabs, and a `+` menu for opening more views.
- Additional views include channel details, roles, members, templates, and settings.
- Clicking a channel can open a contextual detail tab with settings and permission overwrites.
- The desired preview highlights additions, removals, and modifications against the current state.

## Redesign Goal

Make the existing Studio feel elegant, calm, visual, and premium without changing its information architecture or workflow. Improve layout quality, visual hierarchy, density, spacing, typography, component polish, and the clarity of current-versus-desired changes.

Use a refined dark workspace aesthetic inspired by a professional creative tool or developer IDE, not a generic SaaS dashboard. The Discord preview should feel familiar enough to understand, while the surrounding Studio should feel like a focused planning instrument.

## Preserve Exactly

- Three-column Studio structure: history, conversation, preview.
- Chat-native planning workflow.
- VS Code-style right-panel tabs.
- Persistent `Server` tab and contextual `Desired` tab.
- Closable contextual tabs and `+` tab menu.
- Explicit approval gate before execution.
- Current state versus desired state comparison.
- Manual inline editing of desired state.
- Planning, clarification, execution, rollback, failure, and drift states.
- Templates and Settings as Studio surfaces, not unrelated top-level dashboard areas.

## Improve Visually

- Establish a stronger visual focal point around the plan preview and approval decision.
- Give the three columns clearer hierarchy without making the sidebars feel heavy.
- Use restrained surface elevation, subtle borders, and purposeful contrast instead of many boxed cards.
- Make tabs feel tactile and legible while retaining their current behavior.
- Make Discord entities visually scannable: categories, channels, roles, members, permissions, and changes.
- Make additions, removals, and modifications immediately distinguishable through color, badges, iconography, and restrained motion.
- Give the welcome state a more editorial, inviting composition instead of a plain form.
- Keep the composer visually anchored and easy to find.
- Make `Approve`, `Edit`, and `Cancel` visually distinct according to risk and importance.
- Design responsive behavior for smaller screens: collapse or slide side panels rather than squeezing all three columns.

## Visual Direction

- Dark charcoal canvas with slightly lighter layered surfaces.
- One confident accent color for AI/planning actions, with a separate success color and a carefully used warning/destructive palette.
- High-quality typography with clear display, body, metadata, and code-like hierarchy.
- Soft radius and subtle shadows, avoiding excessive rounded card styling.
- Discord-inspired preview details, but do not copy Discord branding so closely that Studio loses its own identity.
- Use icons as orientation aids, not decoration.
- Maintain strong keyboard focus, readable contrast, and clear hover/active/disabled states.

## Important Interaction States To Show

The design should include at least these screens or variants:

1. Empty Studio with guild selected and suggestion prompts.
2. Active planning conversation with the right preview visible.
3. Plan ready for review with visible diff and `Approve` action.
4. Manual desired-state editing mode.
5. Execution in progress with live step status.
6. External Discord change detected, showing drift warning and disabled approval.
7. Right-panel tab interaction with `Server`, `Desired`, and a channel detail tab.

## Avoid

- Do not turn Studio into a dashboard of charts or server analytics.
- Do not replace the conversation with a multi-step wizard.
- Do not hide the desired-state preview behind a separate route.
- Do not remove or flatten the tab system.
- Do not imply that AI changes are applied immediately.
- Do not introduce billing, user management, audit analytics, or unrelated navigation.
- Do not use dense enterprise-admin styling or generic chatbot styling.

## Google Stitch Prompt

Design a polished responsive web app called **Studio**, an AI-assisted Discord server configuration workspace. The user is a Discord server administrator who describes desired server changes in natural language. The AI plans the changes, previews the current Discord state against the desired state, and waits for explicit approval before execution.

Create an elegant dark three-column workspace: a collapsible conversation-history sidebar on the left, a chat-native AI planning conversation in the center, and a Discord-like server preview panel on the right. Keep the right panel’s VS Code-style tabs exactly as a core interaction pattern: persistent `Server` and `Desired` tabs, closable contextual tabs such as channel details, and a `+` menu for Roles, Members, Templates, and Settings.

Make the visual hierarchy premium and calm. The plan preview and the approval decision should be the focal point. Use layered charcoal surfaces, refined typography, subtle borders, one strong accent for AI actions, clear diff badges for added/removed/modified entities, and restrained motion. The interface should feel like a focused creative/developer tool, not a generic dashboard or ordinary chatbot.

Show the selected guild identity in the top header, conversation history grouped by Today/Yesterday/Earlier, a welcoming empty state with suggestion cards, a planning message with a collapsible tool log, a completed plan summary with `Approve`, `Edit`, and `Cancel`, a docked revise composer, and a visual current-versus-desired Discord server preview containing categories, channels, roles, and permissions.

Preserve the existing product behavior and terminology. Do not add charts, billing, analytics, messaging features, or a wizard. Include responsive behavior where side panels collapse into drawers or tabs on narrow screens. Provide accessible contrast and obvious focus, hover, disabled, warning, success, and destructive states.

## Reference Implementation

The current implementation and behavior are documented in:

- `docs/design/studio-and-dashboard.md`
- `docs/IMPLEMENTATION_STATUS.md`, especially the Studio sections
- `apps/web/src/components/studio/`
- `apps/web/src/routes/Studio.tsx`
