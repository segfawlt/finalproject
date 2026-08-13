# Pending Template Attachments

## Goal

Allow a user to select reusable template context in a fresh Server Studio chat,
then use that context when their next prompt starts planning.

## Approved Behavior

- The Templates tab enables `Use` even when there is no active conversation.
- In a fresh chat, `Use` stores the selected template locally as pending context
  and changes the action to `Stop using`.
- Pending templates are not persisted and do not create an empty conversation.
- When the user submits the next non-empty prompt, the client includes the
  pending template IDs in the create-conversation request.
- The server validates that every requested template belongs to the
  authenticated creator, loads its current structure, and attaches it to the
  new `PlanningSession` before planning starts.
- The model therefore receives the current full template structure with the
  submitted prompt, server state, rules, and tools.
- On successful conversation creation, the selected templates remain active as
  that conversation's context. Existing conversation use/stop-using behavior
  continues to call the existing attach/detach endpoints.
- If creation fails, selected templates remain pending so the user can retry or
  remove them. The server rejects missing or inaccessible template IDs rather
  than omitting them.
- Resetting a chat continues to clear pending or active templates.

## Implementation Shape

- Update `TemplatesTab` so its toggle performs a local state update when
  `conversationId` is absent; retain the current API request path when one is
  present.
- Extend `createConversationSchema` with an optional non-empty-array-safe list
  of unique template IDs and pass active template IDs from `useConversation`.
- Reuse the existing creator-scoped template lookup and `PlanningSession`
  attachment API while creating the session. Do not introduce a draft database
  resource or change the template structure supplied by the client.
- Preserve the existing template attach/detach routes for already-created
  conversations.

## Error Handling

- Keep client pending selection unchanged if the create conversation request
  fails.
- Return a client error if any requested template is not found or not owned by
  the current user; do not start planning with partial context.
- Continue showing template attach/detach failures in the Templates tab for
  existing conversations.

## Verification

- Add a TemplatesTab test showing `Use` is enabled without a conversation and
  locally activates the template without an attachment request.
- Add a hook test asserting pending template IDs are sent when the next prompt
  creates a conversation.
- Add a conversation route test asserting validated requested templates are
  passed to the new planning session, plus rejection coverage for unavailable
  IDs.
- Run focused web and server tests, workspace typecheck, and `git diff --check`.
