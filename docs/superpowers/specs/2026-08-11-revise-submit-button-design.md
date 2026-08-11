# Revise Submit Button Design

## Goal

Replace the text-labeled `Revise` button in the completed-plan chat composer with the compact neutral circular up-arrow control commonly used by chatbot composers.

## Scope

- Update `apps/web/src/components/studio/ChatArea.tsx` only.
- Preserve the existing form submission, draft validation, and in-flight guard.
- Preserve the existing loading spinner behavior, rendered inside the circle while a revision is being submitted.
- Do not change API calls, conversation state, prompt handling, or composer positioning.

## Interaction And Accessibility

- The control remains a native submit button in the existing form.
- The button is disabled when the draft is empty or a request is in flight.
- Add `aria-label="Revise"` and `title="Revise"` because the visible text label is removed.
- Use the existing Lucide icon dependency: `ArrowUp` for the idle state and `Loader` for the in-flight state.

## Visual Treatment

- Use a 38px by 38px circular button aligned with the composer’s lower edge.
- Use the existing neutral light action colors (`bg-shell-accent` and `text-shell-accent-fg`) rather than introducing new colors.
- Retain hover, disabled opacity, and disabled cursor states from the current action.
- Keep the textarea and composer container unchanged.

## Verification

- Run the web typecheck or repository typecheck command.
- Run the relevant formatting check.
- Confirm the button has no visible `Revise` text, retains the accessible label, and shows the spinner during submission.
