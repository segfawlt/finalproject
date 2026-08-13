# Shiny Server Selector

## Goal

Refine the `/studio` server selector to match the approved dark Stitch-inspired direction while making selection feedback clear without adding duplicate action text.

## Approved Behavior

- Use a dark near-black canvas and surface consistent with the existing `shell-*` tokens.
- Render available servers as a single-column stacked list.
- The full server row is clickable and navigates to `/studio/:guildId` through the existing link behavior.
- Do not render a separate `Open Studio` button.
- Hovering a row shows a localized, restrained indigo-violet glow around only that row. Hover must not start the shiny animation.
- Clicking a row starts the shiny conic-gradient border animation on that row, then allows normal navigation to proceed.
- The click animation is a one-shot navigation/loading cue, not a continuously looping selected state.
- Preserve existing server icon URLs, initials fallback, member count/latest-conversation metadata, refresh behavior, loading state, error state, empty state, and invite action.
- Keep the implementation compatible with the current Vite + React + Tailwind + TypeScript setup. Do not add shadcn or `styled-jsx` solely for this visual treatment.

## Implementation Shape

- Keep the selector in `apps/web/src/routes/Studio.tsx` unless extraction is required for focused testing.
- Add narrowly scoped CSS for the row hover glow and click-triggered conic-gradient sweep. Use plain CSS because Vite does not currently configure `styled-jsx`.
- Use a local click handler to add the animation class before the existing anchor navigation occurs.
- Respect reduced-motion preferences by disabling the sweep and retaining a static focus/hover treatment.
- Preserve keyboard accessibility: rows remain anchors, retain visible focus styling, and activate through keyboard navigation.

## Responsive Behavior

- Use one column at all viewport sizes.
- Keep row content compact and allow the server name/metadata to truncate rather than overflow.
- Preserve touch usability; hover-only styling must not be required to understand or activate a row.

## Verification

- Add or update focused web tests for selector rendering, row navigation, and click animation class behavior if the implementation is extracted or testable without brittle CSS assertions.
- Run the focused web test suite, `pnpm typecheck`, and the web build.
- Confirm no duplicate `Open Studio` text remains in the active selector.
