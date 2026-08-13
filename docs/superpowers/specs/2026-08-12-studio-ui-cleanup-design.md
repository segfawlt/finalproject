# Studio UI Cleanup

## Goal

Reduce unused Studio controls and make new-chat and guild-selection copy concise and clear.

## Approved Behavior

- Fresh chats show a time-aware greeting only: `Good morning`, `Good afternoon`, or `Good evening`.
- The greeting has one short, neutral supporting line and never names the guild.
- Guild cards with a previous conversation show `Last conversation at: <localized time>` instead of a prompt preview and separate date.
- Guild cards without a conversation continue to show their member count.
- Remove the left and right Studio sidebar collapse/expand controls. Panel widths remain resizable and all other layout behavior remains unchanged.
- Remove the unused Templates header button and the state and props used exclusively by that button.
- Templates remain available through the existing Templates tab, where users can activate or deactivate individual template context.

## Scope

The change is limited to Studio UI, focused component tests, and synchronized implementation-status documentation. It does not change template activation behavior, guild API data, panel resizing, or mobile layout behavior.

## Verification

- Focused tests cover the new greeting, guild recency text, and absence of the removed header and sidebar controls.
- Run focused web tests and `pnpm typecheck`.
