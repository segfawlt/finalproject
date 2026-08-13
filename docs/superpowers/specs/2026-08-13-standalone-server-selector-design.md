# Standalone Server Selector

## Goal

Make `/studio` a focused server-selection screen with no Studio chrome, while keeping `/studio/:guildId` as the full Studio workspace.

## Approved Behavior

- When `guildId` is absent, render a standalone dark selector view instead of `StudioShell`.
- The standalone view must not render the Studio top bar, workspace sidebar, right panel, chat area, or any reserved shell layout space.
- Show the selector heading, supporting copy, refresh control, available server rows, and existing loading/error/empty/invite states.
- Show a dynamic account indicator using the authenticated session name: `Logged in as {user.name}`.
- Do not add account actions or logout behavior to this indicator.
- Preserve the existing `/api/guilds` and `/api/bot/invite` data flow.
- Preserve full-row native navigation to `/studio/:guildId`.
- Preserve the existing localized hover glow and click-only one-shot shiny sweep.
- Keep `/studio/:guildId` on the existing full Studio shell and behavior.

## Layout

- Use the existing near-black `shell-canvas` background.
- Center a single-column selector with responsive horizontal padding.
- Keep the account indicator visually secondary, positioned near the selector content without introducing a navigation bar.
- Keep the refresh control adjacent to the selector heading.
- Do not show duplicate action copy such as `Open Studio`.

## Implementation Shape

- Branch before the `StudioShell` return in `apps/web/src/routes/Studio.tsx`, returning the standalone selector when `guildId` is absent.
- Use `useAuthStore` to read `user`; safely fall back to `User` only if the authenticated user object is unavailable during rendering.
- Reuse the existing selector state and fetch callback. Avoid changing API contracts or guild-specific Studio composition.
- Keep selector-specific CSS namespaced in `apps/web/src/index.css`.

## Verification

- Test `/studio` renders no Studio header/sidebar chrome and includes the dynamic logged-in account label.
- Test server rows and refresh behavior remain available in the standalone view.
- Test `/studio/:guildId` continues rendering the full Studio route composition through existing coverage.
- Run focused Studio tests, workspace typecheck, web build, and `git diff --check`.
