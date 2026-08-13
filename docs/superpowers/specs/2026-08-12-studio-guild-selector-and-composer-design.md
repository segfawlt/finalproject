# Studio Guild Selector and Composer Redesign

## Goal

Make guild selection more useful and make a new Studio conversation feel identical to an ongoing conversation.

## Approved Behavior

- The `/studio` guild selector keeps its current minimal presentation.
- Add a refresh control that reloads guilds and shows a loading/disabled state while refreshing.
- Each guild card shows the latest conversation's short prompt preview and relative update time when available.
- The latest conversation data is loaded through the guild list response so the selector does not issue one request per card.
- Empty and request-error states remain distinct and provide retry through refresh.
- Remove the fresh-chat `WelcomeScreen`, suggestion cards, explanatory copy, and large standalone textarea.
- Fresh and ongoing conversations use one docked composer component.
- Fresh mode submits through `createConversation`; ongoing mode submits through the existing revise flow.
- Fresh mode displays a time-based greeting, such as `Good afternoon`, above the composer.
- Keep the existing global navigation bar for now.
- Keep template `Use`/`Stop using` context actions; remove explicit template merge actions in a later template batch.

## Data Contract

`GET /api/guilds` returns each operable guild with `latestConversation`, containing a truncated-safe prompt and `updatedAt`, or `null`.

## Verification

- API route tests cover latest-conversation selection and empty latest state.
- Web helper/component tests cover relative time, refresh behavior, and fresh/ongoing composer submission wiring.
- Typecheck and the focused Vitest suites pass.
