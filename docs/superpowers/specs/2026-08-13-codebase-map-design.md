# Codebase Map Design

## Goal

Create `docs/CODEBASE_MAP.md`: a compact, current-source-derived index for an AI agent
or project presenter to locate the main implementation of a feature and trace its flow.

## Scope

- Cover the current working tree, including uncommitted code.
- Prioritize backend feature paths: planning, validation, execution and rollback, Discord
  cache and drift, templates, model configuration, authorization, API/SSE, and shared/DB
  contracts.
- Name frontend routes/hooks only when they initiate or consume a backend feature.
- Exclude styling, ordinary UI composition, exhaustive endpoint inventories, tests, and
  implementation walkthroughs.

## Format

Each feature uses only these compact fields when applicable:

```md
## Feature

Purpose: short outcome.
In: entry route/event -> entry function (`path`).
Core: `function()` (`path`); `function()` (`path`).
Flow: component -> component -> result.
Next: adjacent feature.
```

- Cite function or class names with repo-relative paths, not line numbers.
- Use terse semicolon-separated references; do not duplicate details across sections.
- Prefer the source flow over claims from `docs/IMPLEMENTATION_STATUS.md`.
- Keep terminology stable so an AI can search an interview question against headings,
  function names, and flow terms.

## Success Criteria

- A reader can identify a visible backend feature's entry point, core code, and downstream
  flow without reading all source files.
- The document accurately reflects both committed and uncommitted current code.
- The document remains substantially smaller than an implementation-status inventory.

## Verification

Cross-check every named route, function, file, and flow edge against the working tree.
Run Markdown formatting checks if the repository's configured formatter covers docs.
