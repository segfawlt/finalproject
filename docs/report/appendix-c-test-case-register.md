# Appendix C: Detailed Test-Case Register

This appendix preserves the detailed test records summarised in Chapter 6. The
authoritative machine-readable registers remain in `testing/`; this appendix
provides a report-readable version of their test cases, inputs, expected outputs,
observed results, and evidence boundaries. A passing mocked or structural test
does not establish an untested live Discord, browser, PostgreSQL, or provider
boundary.

## C.1 Representative Automated Test Cases

The automated suite recorded 208 passing cases on 1 August 2026. The following
17 cases are the detailed representative records from
`testing/representative-automated-test-cases.csv`.

| ID | Test case and specific input | Expected / actual output | Status and boundary |
| --- | --- | --- | --- |
| AT-01 | Convert `VIEW_CHANNEL; SEND_MESSAGES; ADMINISTRATOR`. | Expected `ViewChannel; SendMessages; Administrator`; all values matched. | Pass: pure conversion function. |
| AT-02 | Apply two overwrites; second references a missing channel. | Expected error with no first overwrite retained; error thrown and map remained empty. | Pass: in-memory desired state. |
| AT-03 | Compare the same role permissions in reverse order. | Expected no `edit_role`; no edit step generated. | Pass: in-memory states. |
| AT-04 | Create a role then assign its symbol to a member. | Expected creation before assignment; two topologically ordered steps generated. | Pass: in-memory states. |
| AT-05 | Target role equals the bot's highest position (5). | Expected hierarchy blocker; blocker returned. | Pass: mocked bot/cache. |
| AT-06 | Supply a channel symbol where a role identifier is required. | Expected symbol-type blocker; blocker returned. | Pass: in-memory plan and mocked bot data. |
| AT-07 | Adapter promise never settles; 100 ms step deadline. | Expected four attempts, three retries, terminal failure; all recorded. | Pass: mocked execution context and fake timers. |
| AT-08 | Pending adapter promise; abort signal after 5 ms. | Expected engine stops waiting and fails plan; unsuccessful result and failure event recorded. | Pass: mocked execution context. |
| AT-09 | Acquire guild `g1` for plan 1, then plan 2. | Expected true then false with first owner retained; observed. | Pass: handwritten fake database. |
| AT-10 | Split streamed `create_channel` JSON arguments across chunks. | Expected one completed call with `staff-chat`; observed. | Pass: constructed SSE stream. |
| AT-11 | Batch permission tool followed by final LLM response. | Expected no clarification pause and completed session; observed. | Pass: mocked fetch and SSE. |
| AT-12 | Compare identical guild projections, then channel and role changes. | Expected no event then specific events; observed. | Pass: in-memory projections/event bus. |
| AT-13 | Change channel topic/lock, role permissions, and member roles. | Expected all entities classified modified; observed. | Pass: pure web utility. |
| AT-14 | Inspect manual-rollback handler source. | Expected Discord state builder, not cache-state assignment; observed. | Pass: source-text inspection only. |
| AT-15 | Evaluate configured rules with missing key, load/provider failures, malformed output, blockers, warnings, and no rules. | Expected all unavailable/invalid policy states block; thirteen cases passed. | Pass: mocked database/provider boundaries. |
| AT-16 | Emit completion before late subscription; separately fail persistence. | Expected terminal replay only after durability; completion replayed and failure emitted no false completion. | Pass: in-memory event bus and mocked persistence. |
| AT-17 | Rebuild planning prompt after attaching a template with a guild rule. | Expected rule present before and after rebuild; observed. | Pass: in-memory planning session. |

## C.2 Independent System, Security, and Performance Cases

The full execution register is `testing/independent-system-test-cases.csv`.
Table C.2 preserves every case recorded there on 1 August 2026.

| ID | Case | Expected output | Recorded actual output | Status |
| --- | --- | --- | --- | --- |
| ST-01 | Complete Discord OAuth from a clean profile. | OAuth completes; no password form or API. | Discord button only; password endpoint returned `400 EMAIL_PASSWORD_DISABLED`. | Pass |
| ST-02 | Reject cross-guild access using guild B identifiers. | Requests reject before data, LLM, or Discord access. | Tested requests returned 403/404/503; unauthenticated requests returned 401. | Partial |
| ST-03 | Keep planning side-effect free for a category, channels, role, and overwrite. | Preview matches independent state; Discord state stays unchanged. | Before/after Discord snapshots identical; preview content was not independently compared. | Partial |
| ST-04 | Execute an unapproved draft plan. | Request rejected; Discord unchanged. | Non-existent plan returned 404; wrong guild 403/404/503; unauthenticated 401. | Partial |
| ST-05 | Execute a reviewed multi-step plan exactly. | Ordered progress; final state matches review; mutations map to stored steps. | Marked `.fixme()`; requires live Discord mutations. | Skipped |
| ST-06 | Enforce strict Discord role hierarchy. | Only lower role editable; blocked cases do not mutate and explain why. | Marked `.fixme()`; requires live Discord mutations. | Skipped |
| ST-07 | Roll back after injected failure. | Reverse convergence and exact residual reporting; final state compared to before state. | Marked `.fixme()`; requires live Discord mutations. | Skipped |
| ST-08 | Reject stale plan and offer confirmed re-planning. | Approval/execution reject without mutation; repair starts fresh. | Live edit changed hash; execution returned 409 with `canAIRepair: true`. | Partial |
| ST-09 | Cancel active planning. | Generation stops; conversation cancelled; no plan produced. | Mock had completed; cancellation returned 409 for no active session. | Partial |
| ST-10 | Abort during pending execution step. | No later step; stop waiting; rollback and report late effects. | Missing-plan abort 404; live abort `.fixme()`. | Partial |
| ST-11 | Roll back after server restart. | Plan/snapshots survive; rollback remains available. | Plan and before-snapshot queryable; live rollback `.fixme()`. | Partial |
| ST-12 | Apply server rules with provider success/failure. | Violations and unavailable/malformed policy results block; no-rule guild skips call. | Rule CRUD and authorization worked; enforcement `.fixme()` without API key. | Partial |
| ST-13 | Protect guild templates. | Authorized operations persist; unauthorized users see no guild data. | Listed/read/created templates and unauthenticated 401 observed; other operations/tenant incomplete. | Partial |
| ST-14 | Detect direct Discord edit. | Fresh observation persists one event and notifies affected guild only. | Drift stream emitted `channel_updated` for affected guild; persistence not asserted. | Partial |
| ST-15 | Retain audit record over planning/execution and restart. | Conversation, plan, results, and timestamps survive. | Conversation, iteration, and plan rows queryable; completed execution/restart not tested. | Partial |
| ST-16 | Present actionable errors. | Each public failure explains cause and next action. | Selected missing-guild, inactive-session, access, missing-plan, and approval errors were descriptive. | Partial |
| PF-01 | Measure event ordering. | Progress appears before terminal event. | Conversation SSE emitted `streaming_ready`; multi-step ordering skipped. | Partial |
| PF-02 | Measure cached-read latency with 20 concurrent clients. | p95 ≤ 1 second. | p95 = 2072 ms; exceeds requirement target. | Fail |
| PF-03 | Measure 30-second step and five-minute execution deadlines. | Engine stops waiting, then rolls back and cleans lock. | Configuration verified; live timeout `.fixme()`. | Partial |
| PF-04 | Send 110 requests inside the rate-limit window. | Requests beyond 100 receive explanatory 429. | 62 OK; 48 rate-limited; response contained rate-limit error. | Pass |

## C.3 Detailed Automated Results by Test File

The complete per-file automated result register is
`testing/automated-test-results.csv`. It records 27 test files and 208 passing
cases, with each file's evidence boundary and revision. It is retained as CSV
because it is more suitable for auditing and spreadsheet import than a repeated
report table.

