# Chapter 6: Testing and Evaluation

## 6.1 Evaluation Objectives

Testing was used to determine whether the implemented platform behaves as specified in Chapter 3
and whether its safety mechanisms remain effective when inputs, external state, or dependencies do
not behave as expected. This distinction is important for an AI-assisted administration system.
A generated plan can be syntactically valid while still being inappropriate for the current guild,
and an execution can complete at the API level while leaving Discord in a state different from the
reviewed preview. The evaluation therefore considers both internal correctness and externally
observable outcomes.

The evaluation has five objectives:

1. verify deterministic planning logic such as desired-state mutation, diff generation, dependency
   ordering, and validation;
2. verify that execution control handles deadlines, retries, aborts, locks, and rollback without
   bypassing the reviewed plan;
3. verify the complete user-visible flow from authentication and planning through approval,
   execution, and recovery;
4. assess security, performance, and usability against the acceptance criteria in Section 3.2; and
5. identify limitations that prevent a requirement from being claimed as fully demonstrated.

Passing implementation-authored tests is not treated as proof of the complete system. A test can
repeat the same mistaken assumption as the code under test, while a mock can behave more simply
than Discord, PostgreSQL, a browser, or an LLM provider. For that reason, this chapter separates
automated regression evidence from live demonstration evidence and from independent evaluation
that has not yet been performed.

## 6.2 Testing Strategy

### 6.2.1 Levels of testing

The testing strategy follows the architecture described in Chapter 4.

- **Unit testing** exercises pure functions and isolated state transitions. This is the strongest
  existing evidence for permission-name conversion, desired-state operations, tool schemas, diff
  generation, validation rules, stream parsing, and client-side diff utilities.
- **Component testing** connects a small number of real modules while replacing external
  dependencies. Examples include the `ServerState` → diff → validation pipeline and the planning
  session with a simulated OpenAI-compatible stream.
- **Integration testing** should cross an actual system boundary, such as a Hono route with
  PostgreSQL, the Discord adapter with a test guild, or the browser with the API. The existing file
  named `integration.test.ts` integrates only the diff engine and validator over in-memory objects;
  it is therefore classified as a component test in this chapter.
- **System and acceptance testing** operates the deployed application through its public UI or API
  and observes the dedicated Discord guild and database. This level is required for claims about
  OAuth, tenant isolation, live Discord mutation, persistence, rollback, and end-user behavior.
- **Regression testing** reruns previously failing scenarios after a correction. The current suite
  contains regression cases for unchanged permission arrays, strict Discord role hierarchy,
  planning-only permission batches, and per-step deadlines.

### 6.2.2 Requirement-derived test design

Test cases should be derived from the requirements and acceptance criteria before their expected
results are compared with the implementation. Each case records a requirement identifier, explicit
preconditions and input, expected output, actual output, status, and evidence location. This creates
the traceability chain:

```text
FR / NFR / business rule
        ↓
independent test case and expected result
        ↓
observed UI, API, database, and Discord result
        ↓
pass, fail, partial, or not evaluated
```

For deterministic functions, the expected value can be stated directly. For a system test, the
expected Discord state must be specified independently rather than calculated by the platform's own
diff engine. Reusing the same production algorithm as the test oracle would allow the
implementation and the test to agree on the same defect.

### 6.2.3 Result classification

The following statuses are used:

| Status            | Meaning                                                                                   |
| ----------------- | ----------------------------------------------------------------------------------------- |
| Pass              | The recorded actual output satisfies the independently stated expected output.            |
| Fail              | The observed output contradicts the expected output.                                      |
| Partial           | Some behavior is supported, but an important boundary or acceptance criterion is absent.  |
| Blocked           | The case was attempted but could not complete because a prerequisite was unavailable.     |
| Not yet evaluated | No controlled execution and result have been recorded; code existence is not substituted. |

### 6.2.4 Test record format

The result data accompanying this chapter is stored under `docs/report/testing/`. CSV was selected
because it can be inspected directly, imported into a spreadsheet, and processed without a
project-specific tool. The files serve different purposes:

- `automated-test-results.csv` records the number of cases and result for every automated test file;
- `representative-automated-test-cases.csv` records the specific inputs, expected outputs, actual
  outputs, evidence boundary, and result for the cases summarised in Table 6.2; and
- `independent-system-test-cases.csv` is the execution register for the system, security,
  performance, and usability work. It preserves the original expected output alongside the actual
  output, status, environment, date, and evidence recorded during the August 2026 run.

A `Not yet evaluated` row is a test specification, not a test result. When a pending case is
executed, the tester must record the environment, date, actual output, status, and an evidence path
without replacing the original expected output.

## 6.3 Automated Regression Testing

The test cases in this section are executed automatically by Vitest. "Automated" means the tests
are defined as executable code, run by a test framework without manual interaction, and verified
by programmatic assertions rather than human observation. The author writes test specifications
and runs the test command; the tool executes the test logic, compares actual output to expected
assertions, and reports pass or fail without further human intervention during the test run itself.

### 6.3.1 Environment and execution

A fresh automated run was performed on 1 August 2026 against the working tree after the Section 5.8
implementation-review fixes, with the following environment:

| Item          | Value                                                                                                                          |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Operating OS  | Linux 7.1.5-zen1-2-zen, x86-64                                                                                                 |
| Node.js       | 24.16.0                                                                                                                        |
| pnpm          | 11.9.0                                                                                                                         |
| Vitest        | 4.1.7                                                                                                                          |
| Test runtime  | Node environment configured by Vitest                                                                                          |
| Test database | Local PostgreSQL URL supplied to configuration validation; database access was mocked by the existing database-dependent tests |
| External APIs | Discord and LLM calls were mocked or replaced by local streams                                                                 |

The suite was run with `NODE_ENV=test`, synthetic local authentication configuration, and
`pnpm test:run`. Configuration values are not included because credentials are not test evidence
and must not be written into the report. Without the mandatory database, authentication-secret, and
application-URL variables, three server suites fail during module import before their assertions are
collected. Supplying valid non-secret test values produced the result in Table 6.1.

**Table 6.1. Automated test result by repository layer**

| Layer                    | Test files | Test cases |  Passed | Failed |
| ------------------------ | ---------: | ---------: | ------: | -----: |
| Shared domain package    |          8 |         63 |      63 |      0 |
| Server and planning code |         16 |        110 |     110 |      0 |
| Web stores and utilities |          3 |         35 |      35 |      0 |
| **Total**                |     **27** |    **208** | **208** |  **0** |

The executable inventory and fresh result are used here. The full result summary is stored in
`testing/automated-test-results.csv`, with the selected detailed records in
`testing/representative-automated-test-cases.csv`.

### 6.3.2 Representative automated cases

Table 6.2 records representative inputs and outputs from the suite. These cases were selected for
their connection to the system's principal risks rather than to make the table appear exhaustive.

**Table 6.2. Representative automated test cases**

| ID    | Area and input                                                                                                                  | Expected output                                                                                            | Actual output                                                                          | Result |
| ----- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------ |
| AT-01 | Convert permission names `VIEW_CHANNEL`, `SEND_MESSAGES`, and `ADMINISTRATOR` to Discord.js-style names                         | `ViewChannel`, `SendMessages`, and `Administrator`                                                         | All values matched                                                                     | Pass   |
| AT-02 | Apply a two-item permission batch where the second item references a non-existent channel symbol `missing-channel`              | Throw an error and retain no overwrite from the first item                                                 | An error was thrown; the overwrite map remained empty                                  | Pass   |
| AT-03 | Compare a real role and desired role whose permission arrays contain identical values                                           | Generate no `edit_role` step                                                                               | No role-edit step was generated                                                        | Pass   |
| AT-04 | Plan that creates role "Moderator" and assigns it to member "alice" in the same desired state                                   | Place role creation before member assignment and resolve the dependency                                    | Two steps were generated in topological order                                          | Pass   |
| AT-05 | Target an existing role "Helper" at the same hierarchy position as the bot                                                      | Validation fails because Discord requires the bot to be strictly above the target                          | Validation returned a blocker                                                          | Pass   |
| AT-06 | Pass a channel symbol `#new-channel` where a role identifier is expected                                                        | Validation rejects the symbol-type mismatch                                                                | Validation returned a blocker                                                          | Pass   |
| AT-07 | Execute a member-role assignment step whose adapter promise never settles, with a 100 ms test deadline                          | Four total attempts, three retry events, then a terminal plan failure                                      | Four calls, three `step_retry` events, and `plan_failed` were recorded                 | Pass   |
| AT-08 | Abort execution while an adapter promise is still pending                                                                       | Stop waiting for the step and return a failed result                                                       | The result was unsuccessful and a `plan_failed` event was recorded                     | Pass   |
| AT-09 | Acquire a guild lock twice using two distinct plan/owner pairs                                                                  | First acquisition succeeds; second acquisition fails and does not replace the owner                        | Returned `true` then `false`; the first plan and owner remained                        | Pass   |
| AT-10 | Parse stream fragments `{"name":` and `"staff-chat"}` for a `create_channel` tool call                                          | Reconstruct one call with arguments `{"name":"staff-chat"}`                                                | One completed tool call with the expected name and arguments was returned              | Pass   |
| AT-11 | Receive a planning-only `batch_set_overwrite` call with permission configuration for three channels, followed by final response | Continue the planning loop without entering `ask_user`; store the overwrite                                | Session reached `completed`, emitted no `ask_user`, and stored the expected permission | Pass   |
| AT-12 | Compare two identical guild projections and then projections containing channel, role, or field differences                     | No drift for identical projections; specific drift events for each difference                              | The detector produced the expected empty or specific event sets                        | Pass   |
| AT-13 | Compare current and desired state where channel topic, permissions-lock, role permissions, and member roles differ              | Mark each changed entity as modified                                                                       | Client diff utilities classified the expected entities as modified                     | Pass   |
| AT-14 | Inspect the manual rollback handler source                                                                                      | Handler text calls `buildCurrentStateFromDiscord()` rather than the custom-cache projection                | The expected source string was present and the cache-builder assignment was absent     | Pass   |
| AT-15 | Evaluate policy with rules unavailable (missing key), provider failure/timeout, empty output, or malformed JSON                 | Every unavailable or invalid policy result becomes a block; a no-rule guild skips the call                 | Thirteen cases passed, including valid empty, blocker, warning, and availability paths | Pass   |
| AT-16 | Emit planning completion before any SSE subscriber attaches, then subscribe; separately make turn persistence throw             | Late subscriber receives the terminal event; persistence failure emits `error` and never emits `completed` | Terminal replay matched; failed persistence rejected the turn with no false completion | Pass   |
| AT-17 | Create a planning session with a saved guild rule, then attach a template and rebuild its system prompt                         | The initial and rebuilt prompts both retain the numbered guild rule                                        | The rule remained present before and after prompt rebuilding                           | Pass   |

AT-14 is deliberately described as a source-structure assertion. It proves that one textual call is
present in the handler, but it does not execute the route or prove that Discord state is fetched
successfully at runtime.

### 6.3.3 Strength of the automated evidence

The automated suite provides useful evidence within the boundaries it actually exercises:

- desired-state operations reject invalid references and preserve atomicity for permission batches;
- selected channel, permission, and member-role tools plan and dispatch the expected values;
- the diff engine handles selected member-role, overwrite, hierarchy, and external-deletion cases;
- validation rejects selected unsafe hierarchy, duplicate, channel-type, and symbol-type cases;
- the execution loop implements the tested abort, deadline, and retry behavior;
- event buses, stream parsing, drift comparison, UI state, and UI diff classification behave
  consistently for the supplied in-memory inputs; and
- the complete suite can be rerun offline without contacting Discord or an LLM provider.

However, the suite cannot by itself support a claim that the platform has passed system acceptance:

1. Discord.js behavior is represented by mock contexts or in-memory maps.
2. The locking tests use a handwritten fake database rather than PostgreSQL.
3. The planning tests use constructed SSE responses rather than a real provider.
4. The file named `integration.test.ts` does not cross a process, database, HTTP, browser, or Discord
   boundary.
5. The plan-route test inspects source text instead of issuing an HTTP request.
6. The Vitest web tests cover stores and pure utilities; there are no rendered `.test.tsx` component
   tests or jsdom interaction tests. Playwright system tests are assessed separately in Section 6.5.
7. No statement or branch coverage measurement is configured.
8. The suite was created alongside the implementation and no mutation score or independent
   fault-seeding result has yet been recorded.

Accordingly, “208 passed” is reported as an automated regression result, not as 100% requirement
coverage or proof that all production flows are correct.

## 6.4 Recorded Live Demonstration

Chapter 5 records one demonstration on a dedicated Discord guild. The available captures support
the following observations:

- Discord OAuth and the authenticated guild picker were displayed.
- Planning progress was streamed into the Studio.
- A completed desired-state preview showed proposed categories, channels, roles, and permissions.
- Iteration history, template browsing, and guild-rule settings were visible.
- Discord returned a real permission failure during an early execution attempt, and the Studio
  displayed that failure rather than reporting success.
- After the discovered permission-array and equal-role-position defects were corrected, a later
  execution reached the completed state.
- A rollback request completed with zero reverse steps because the observed live structure had
  already converged to the before-snapshot after the temporary channel operation.
- A stale desired state was displayed, although the full confirmed re-plan path was not captured.

This evidence is valuable because it crosses the browser, server, and Discord boundaries that the
automated suite mocks. It also shows that live testing exposed defects that passing isolated tests
had not initially prevented. Nevertheless, it was a development demonstration rather than a
controlled acceptance run: the exact initial guild fixture, input prompt, API transcript, database
rows, and independently specified expected state were not preserved as one repeatable test record.
The captures therefore support implementation evidence but are not counted as a complete pass for
the affected functional and non-functional requirements.

## 6.5 Independent System Test Design

### 6.5.1 Test data and oracle

Independent system testing should use a dedicated guild containing a small, recorded fixture:

- one category with two text channels;
- one voice channel;
- an `@everyone` overwrite plus one role-specific overwrite;
- a bot role placed above one manageable role and at or below one unmanageable role;
- two test members with known role assignments; and
- a second Discord account that does not hold _Manage Server_.

Before each case, the guild fixture should be restored and captured through Discord's supported API.
Expected outcomes should be written into the test case before execution. Names, positions,
permissions, and member-role assignments can then be compared after planning, execution, or
rollback. Volatile identifiers and timestamps should be normalised, but meaningful resource IDs
must remain available when a case concerns identity or deletion.

The core procedure is shown in Algorithm 6.1.

**Algorithm 6.1. Independent plan, execution, and rollback evaluation**

```text
INPUT:
    recorded guild fixture F
    natural-language request R
    independently specified expected state E

restore the Discord test guild to F
BEFORE ← fetch and normalise state through the Discord API

submit R through the public Studio or HTTP API
wait for the completed preview
PRE_APPROVAL ← fetch and normalise state through the Discord API
assert PRE_APPROVAL = BEFORE

review the displayed desired state
assert the displayed result matches E

approve and execute the plan
AFTER ← fetch and normalise state through the Discord API
compare AFTER with E and record every difference

request rollback
ROLLED_BACK ← fetch and normalise state through the Discord API
compare ROLLED_BACK with BEFORE and record every residual difference

record UI events, API responses, database records, and Discord states
```

The expected state `E` must not be generated by the production diff engine. It is an independently
written oracle derived from the fixture and requirement.

### 6.5.2 Priority system cases

The cases in Table 6.3 are required before the corresponding requirements can be presented as fully
evaluated. Partial status records a controlled result for only part of the stated acceptance
criterion; it is not treated as a full pass.

**Table 6.3. Independent system and acceptance cases**

| ID    | Requirements                          | Procedure and input                                                                                                  | Expected result                                                                                                                         | Current status                                                                                                                                                 |
| ----- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ST-01 | FR-1, NFR-10                          | Sign in from a clean browser profile using a dedicated Discord account                                               | Discord OAuth completes; no local password form or password API is exposed                                                              | Pass, Discord-only login surface and disabled email/password endpoint verified                                                                                |
| ST-02 | FR-2, FR-4, NFR-11, BR-8              | Request guild data, templates, rules, planning, and execution for a guild the account cannot manage                  | Every request is rejected before guild data, LLM calls, or Discord mutation                                                             | Partial, requests were non-successful, but accepted 503 responses and no downstream-call instrumentation limit the claim                                      |
| ST-03 | FR-5–FR-10, NFR-1, NFR-16, BR-1, BR-7 | Request a category, channels, role, and overwrite; inspect Discord before approval                                   | A matching preview and diff are shown while the normalised live Discord structure remains unchanged                                     | Partial, unchanged Discord structure verified; the mock stopped at `waiting_for_user`, so the independently specified preview was not compared                |
| ST-04 | FR-17, FR-18, NFR-1                   | Call execution for a draft or otherwise unapproved plan                                                              | Request is rejected and no Discord mutation occurs                                                                                      | Partial, authentication, wrong-guild, and missing-plan gates passed; execution of a real draft plan was not exercised                                         |
| ST-05 | FR-18, FR-19, NFR-7, NFR-18           | Approve and execute a multi-step independently specified desired state                                               | Ordered events are visible; final Discord structure matches the reviewed state; every mutation corresponds to a stored plan step        | Skipped, requires controlled live Discord mutation                                                                                                            |
| ST-06 | FR-3, FR-15, NFR-21, BR-4             | Attempt to edit a role below, equal to, and above the bot's highest role                                             | Only the strictly lower target is permitted; blocked cases make no mutation and explain the hierarchy requirement                       | Skipped, requires controlled live roles around the bot's hierarchy position                                                                                   |
| ST-07 | FR-20, NFR-2, BR-9                    | Inject a terminal failure after at least one successful mutation                                                     | Reverse convergence is attempted; the API and UI report success or exact residual divergence; Discord is compared with the before-state | Skipped, requires a controllable failure during live Discord execution                                                                                        |
| ST-08 | FR-21, FR-24, NFR-4, BR-3             | Change Discord after planning and before approval, then try approval and execution                                   | Both operations reject the stale plan and make no further mutation; the user can start confirmed re-planning from fresh state           | Partial, live edit caused execution to return 409 with `canAIRepair`; approval and repair were not exercised                                                  |
| ST-09 | FR-27                                 | Cancel while the LLM is still generating a plan                                                                      | Generation stops, the conversation reaches a terminal cancelled state, and no plan can execute                                          | Partial, completed-session rejection was verified; the mock completed before active cancellation could be observed                                            |
| ST-10 | FR-28, NFR-2, NFR-9                   | Abort a multi-step execution while one step is pending                                                               | No later steps are scheduled; the engine stops waiting, attempts rollback, and reports possible late in-flight effects                  | Partial, missing-plan response passed; abort during an in-flight Discord step was skipped                                                                     |
| ST-11 | FR-22, NFR-5                          | Restart the server after completed execution, then request rollback using retained snapshots                         | The completed plan and snapshots survive restart and rollback can still be attempted                                                    | Partial, persisted plan access was observed; a controlled restart followed by rollback was skipped                                                            |
| ST-12 | FR-16, FR-25                          | Create a blocking guild rule; submit a violating plan with the policy provider available, unavailable, and malformed | Valid violations retain their severity; unavailable or malformed evaluation blocks execution; a guild without rules skips the call      | Partial, rule CRUD and access controls passed; provider-backed public policy enforcement was skipped                                                          |
| ST-13 | FR-14, FR-26, NFR-11                  | Read, edit, attach, and merge a template; repeat read using an unauthorized account                                  | Authorized operations persist correctly; unauthorized reads and writes disclose no guild template data                                  | Partial, list, read, create, and unauthenticated rejection passed; edit, attach, merge, and a second authenticated tenant were not exercised                  |
| ST-14 | FR-24                                 | Edit a channel directly in Discord and wait for the configured detection interval                                    | A fresh Discord read detects the change, persists one drift event, and notifies only the affected guild                                 | Partial, live edit emitted a guild-scoped drift SSE event; database persistence was not asserted                                                              |
| ST-15 | NFR-13                                | Complete planning and execution, restart the server, and query the stored history                                    | Conversation, owner, plan data, status, results, and timestamps remain available                                                        | Partial, conversation, iteration, and plan records were queryable; completed execution and a controlled process restart were not part of the case             |
| ST-16 | NFR-17                                | Trigger permission, stale-state, conflict, timeout, and provider failures                                            | Each response explains the cause and a useful next action rather than exposing only a raw provider code                                 | Partial, selected missing-resource, cross-guild, and session-state errors were descriptive; permission, timeout, and provider failures were not all triggered |

Several cases target specific risks found during the implementation review. In particular, ST-02
can expose missing authorization on template reads; ST-07 can detect false
`rollback_completed` reporting; ST-12 verifies the implemented fail-closed rule boundary through a
public flow; and a fast form of ST-03 can reveal planning events emitted before the browser
subscribes. Their expected outcomes come from Chapter 3, not from the current behavior.

### 6.5.3 Playwright E2E test execution

On 1 August 2026, the independent system test register (ST-01 through ST-16 and PF-01 through PF-04)
was implemented using Playwright 1.60.0 and attempted against the local development environment.
The runner reported 45 passing assertions and eight skipped assertions. Table 6.3a instead counts
the 20 complete case specifications: a case is partial when its runnable assertions pass but do not
cover the complete preconditions and expected output. The results are recorded in
`independent-system-test-cases.csv`.

**Table 6.3a. E2E test execution summary**

| Status    |  Count | Description                                                                    |
| --------- | -----: | ------------------------------------------------------------------------------ |
| Pass      |      2 | Complete stated result observed for ST-01 and the supplementary PF-04 case     |
| Partial   |     14 | Runnable assertions passed, but part of the stated expected output was absent  |
| Fail      |      1 | PF-02 exceeded the requirement's declared one-second p95 target                |
| Skipped   |      3 | ST-05, ST-06, and ST-07 had no runnable assertion for their principal behavior |
| **Total** | **20** | Twenty cases specified; seventeen attempted at least in part and three skipped |

The test execution revealed:

1. **Mock LLM behavior**: The mock planner (used when `LLM_API_KEY` is unset) completes in 3–8
   seconds and always calls the `ask_user` tool, leaving conversations in `waiting_for_user` status.
   This is side-effect free as intended but prevents testing full plan completion without a real LLM.

2. **Authentication and authorization**: All OAuth-only assertions pass (ST-01: 2/2 tests). The
   tested cross-guild requests returned non-success responses (ST-02: 7/7 assertions), and the
   exercised template requests respected the tested authorization boundaries (ST-13: 4/4
   assertions). Unauthenticated requests returned 401. These results do not prove the unobserved
   downstream non-invocation or complete template lifecycle in the original cases.

3. **Planning side-effects**: ST-03 verified Discord state remains unchanged after planning completes.
   Channel count, role count, and all names identical before and after.

4. **Execution safety**: ST-04 verified authentication, wrong-guild, and missing-plan rejection, but
   did not execute a real draft plan. ST-09 verified the response after the mock session had already
   completed, not cancellation while generation remained active.

5. **Persistence**: ST-15 found conversations, plans, and iterations queryable in PostgreSQL during
   the running environment. It did not perform the process restart or completed-execution audit
   sequence in its stated procedure. ST-11 exercised persisted plan access when prior data was
   available; rollback after a controlled restart remained skipped.

6. **Policy enforcement**: ST-12 verified rule CRUD operations and authorization (4/5 tests). Policy
   enforcement with LLM provider skipped (.fixme).

7. **Error messages**: ST-16 found descriptive error fields for selected missing-guild,
   cross-guild, missing-plan, and inactive-session responses. It did not trigger every permission,
   conflict, timeout, and provider failure named by the case.

8. **Performance**: PF-02 measured p95 = 2072 ms for 20 concurrent state reads. Although the
   Playwright assertion used a five-second local guard and passed, the recorded result failed the
   one-second NFR-8 acceptance target. The supplementary PF-04 case observed rate limiting (62 OK,
   48 rate-limited out of 110 requests).

9. **Live manual results**: ST-08 observed a direct Discord edit and verified that execution was
   rejected with HTTP 409 and `canAIRepair: true`. ST-14 subscribed before a second channel edit and
   received a `channel_updated` event for the affected guild. PF-01 verified that an authenticated
   conversation stream emits `streaming_ready` immediately after connection.

10. **Remaining skipped tests**: Eight individual tests remain marked `.fixme()`: ST-05, ST-06,
    ST-07, ST-10, ST-11, ST-12, the multi-step execution half of PF-01, and PF-03. They require a
    controlled live execution, injected failure, restart boundary, provider result, or hung adapter.

Full test artifacts (screenshots, video recordings, traces) are stored in `test-results/`. Detailed
findings in `e2e/TEST_RESULTS.md`.

## 6.6 Non-Functional Evaluation

### 6.6.1 Performance and responsiveness

The automated suite confirms event ordering and deadline behavior only with constructed streams and
fake timers. Playwright E2E tests executed on 1 August 2026 provide the following measurements:

| ID    | Requirement           | Workload                                                                                 | Target from Chapter 3                                                | Status                                                                                                 |
| ----- | --------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| PF-01 | NFR-7                 | One representative planning run and one multi-step execution, recording event timestamps | Progress event appears before the terminal event                     | Partial, authenticated stream emitted `streaming_ready`; multi-step progress ordering remains skipped |
| PF-02 | NFR-8                 | Cached state and preview reads under 20 concurrent local clients                         | p95 response time no greater than one second                         | Fail, measured p95 = 2072 ms, exceeding the declared target                                           |
| PF-03 | NFR-9                 | Hung adapter request and an execution exceeding the overall deadline                     | 30-second step bound and five-minute plan bound, followed by cleanup | Partial, config verified (5min/30s), live timeout test skipped                                        |
| PF-04 | Supplementary control | More than 100 API requests in one minute from one client                                 | Requests beyond the configured window are rate-limited               | Pass, 62 OK, 48 rate-limited out of 110 requests                                                      |

**PF-02 latency**: The local environment ran PostgreSQL, the Hono server, and 20 Playwright request
contexts on one machine, which is relevant context but does not change the criterion after the
measurement. The Playwright test's five-second assertion acted as a coarse local regression guard;
it was not the NFR-8 acceptance threshold. The measured p95 of 2072 ms therefore fails the declared
one-second target. A later deployment benchmark may explain the bottleneck or justify a prospective
revision to the requirement, but no faster production result is inferred here.

**PF-04 rate limiting**: The 100 requests/minute window is correctly enforced. Test sends 110 requests
in rapid succession; 62 complete successfully (200), 48 are rate-limited (429 with descriptive error
message). The test runs last alphabetically (filename `zzz-pf-04-rate-limit.spec.ts`) to avoid
exhausting the rate limit before other tests run.

### 6.6.2 Security and privacy

Code inspection shows Discord OAuth, server-side environment configuration, guild authorization
helpers, plan validation, and rate limiting. These controls are design and implementation evidence.
Playwright E2E tests executed on 1 August 2026 provide the following controlled results:

**Authentication (NFR-10)**:

- ST-01 verified no password form exposed in UI (2/2 tests)
- Email/password endpoint returns 400 with `EMAIL_PASSWORD_DISABLED` error code
- Discord OAuth button is the only authentication method visible

**Authorization (NFR-11)**:

- ST-02 verified cross-guild isolation across all endpoints (7/7 tests)
- Unauthorized guild access: all state/plans/conversations/rules requests return 403/404/503
- Unauthenticated requests return 401 across protected endpoints
- ST-13 verified template authorization (4/4 tests): authorized users can list/read/create templates;
  unauthorized users get 401 on all template operations

**Observed security controls**:

- OAuth-only authentication (no local password storage)
- Guild authorization enforced before data access
- Template read/write authorization enforced
- Rate limiting active (PF-04)
- Cross-guild identifier substitution blocked
- Unauthenticated route access blocked

**Not yet verified**:

- Inspection of HTTP responses and browser bundles for credential leakage using synthetic sentinel
  secrets
- Malformed request bodies and tool arguments at API boundaries
- Verification that LLM and Discord calls are not made after authorization rejection (requires
  instrumentation or network capture)

NFR-10 is demonstrated for the tested authentication surface. NFR-11 remains partial because the
cross-guild tests accepted availability responses and did not instrument whether rejected requests
avoided every downstream database, LLM, and Discord call. Full security compliance also requires
penetration testing and credential-leakage inspection.

### 6.6.3 Usability

The screenshots show a Discord-like preview and a natural-language workflow, but they do not measure
whether representative users can understand or complete tasks. NFR-14 and NFR-15 define assessment
targets rather than implemented guarantees. The proposed evaluation recruits five Discord
administrators and asks each participant to:

1. identify additions, modifications, and removals in one preview;
2. create a support category with three channels through plain English;
3. revise the result and restore an earlier iteration; and
4. explain whether Discord has changed before approval.

Completion, correctness, assistance required, elapsed time, and participant comments should be
recorded. The target is at least four of five participants, or 80%, completing the preview and
natural-language tasks successfully. No participant result has yet been collected, so the target is
not presented as achieved.

### 6.6.4 Fault detection and mutation testing

Because the regression tests were developed with the implementation, their ability to reject faulty
implementations should also be measured. On an isolated temporary branch, one small fault can be
introduced at a time:

- allow execution without approved status;
- change strict role hierarchy from `botPosition > targetPosition` to an equality-permitting rule;
- remove stale-state rejection;
- omit the reverse-diff call after a step failure;
- classify a terminal abort as retryable; or
- emit rollback completion after a failed reverse plan.

The relevant tests are then run and the mutation is restored. A mutation is _killed_ when at least
one test fails for the intended reason; it _survives_ when the suite still passes. The mutation score
is:

```text
mutation score = killed non-equivalent mutations / all non-equivalent mutations × 100%
```

The live runs changed only existing channel metadata and did not execute a generated plan. The
chapter therefore does not infer multi-step execution or rollback strength from these results.

## 6.7 Requirements Evaluation

Table 6.4 summarises what the current evidence supports. “Partial” means that code and one or more
isolated tests or captures exist, but the requirement's complete acceptance criterion has not been
demonstrated.

**Table 6.4. Current evidence against requirement groups**

| Requirement group                               | Existing evidence                                                                                                        | Assessment                                                                                                                                                 |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authentication and guild access (FR-1–FR-4)     | OAuth and guild-picker captures; authorization code inspection; ST-01 and ST-02 E2E assertions                           | Partial, OAuth surface verified; cross-guild responses rejected, but downstream non-invocation and exact manage-guild filtering need stronger observation |
| Planning and cancellation (FR-5–FR-8, FR-27)    | Mocked planning-session and stream-parser tests; live planning capture; ST-03 and ST-09 E2E assertions                   | Partial, side-effect-free planning verified; active cancellation and a complete independent preview oracle remain                                         |
| Preview and iteration (FR-9–FR-14)              | Desired-state, client-diff, and store tests; preview, iteration, and template captures; ST-13 assertions                 | Partial, interfaces and isolated behavior evidenced; full browser workflows and user comprehension were not evaluated                                     |
| Validation and approval (FR-15–FR-17)           | Structural-validator and fail-closed policy tests; ST-04 and ST-12 assertions                                            | Partial, isolated validation is strong; draft-plan rejection and provider-backed public policy flow remain incomplete                                     |
| Execution and interruption (FR-18–FR-21, FR-28) | Execution-loop tests for two member operations, timeout, and abort; one recorded live execution; ST-08 and ST-10 partial | Partial, stale execution rejection verified live; approval repair, live abort, and complete execution remain                                              |
| Post-execution and monitoring (FR-22–FR-24)     | Drift-comparison tests; live drift SSE capture; ST-11, ST-14, and ST-15 assertions                                       | Partial, live notification and selected persistence observed; drift-row persistence and rollback after controlled restart remain                          |
| Rule and template management (FR-25–FR-26)      | Fail-closed policy tests, UI captures, implementation inspection, ST-12 and ST-13 assertions                             | Partial, rule CRUD and basic template authorization observed; provider flow and complete template lifecycle remain                                        |
| Safety and reliability (NFR-1–NFR-6)            | Strong isolated evidence for validation, locks, retries, and deadlines; partial ST-03, ST-04, and ST-08 cases            | Partial, deterministic safeguards are well tested; their complete public live composition is not                                                          |
| Performance (NFR-7–NFR-9)                       | Live SSE readiness, constructed event/deadline tests; PF-02 failure; PF-03 partial                                       | Partial with a failed target, event readiness observed, p95 target missed, and live execution deadlines remain unmeasured                                 |
| Security and privacy (NFR-10–NFR-13)            | Architectural controls, code inspection, and ST-01, ST-02, ST-13, ST-15, and ST-16 assertions                            | Partial, delegated authentication is strong; tenant-call isolation, secret scanning, and restart-based audit evidence remain incomplete                   |
| Usability (NFR-14–NFR-17)                       | UI captures and utility tests; ST-16 actionable error messages (5/5)                                                     | Partial, error messages verified; user study not performed                                                                                                |
| Architecture and validation (NFR-18–NFR-20)     | Declarative state, registered-tool, schema, diff, and validation tests                                                   | Partial, public API boundaries and unregistered-model-call rejection need broader tests                                                                   |
| Compatibility and deployment (NFR-21–NFR-23)    | Discord.js and configurable LLM adapter implementation                                                                   | Not demonstrated against two providers or a clean deployment record                                                                                        |

The strongest current result is deterministic component behavior: all 208 collected automated
unit/component cases pass. Playwright also reports 45 passing assertions and eight skipped, but
those runner totals must not be read as 45 complete requirement passes. The 1 August 2026 run added
the following controlled observations:

**Newly verified through E2E tests**:

- OAuth-only authentication with no password form (ST-01)
- Non-success responses for tested unauthorised and wrong-guild requests (ST-02)
- Side-effect free planning (ST-03)
- Authentication, wrong-guild, and missing-plan execution gates (ST-04)
- Basic template list/read/create authorization boundaries (ST-13)
- Queryability of selected conversation, iteration, and plan records (ST-15)
- Descriptive errors for selected public failure responses (ST-16)
- Rate limiting enforcement (PF-04)
- Completed-session cancellation rejection (ST-09)
- Stale-plan execution rejection after a live Discord edit (ST-08)
- Guild-scoped drift SSE notification after a live channel edit (ST-14)
- Authenticated conversation-stream readiness (PF-01)

**Partially verified**:

- Stale plan handling (live execution rejection verified; approval rejection and repair remain)
- Abort behavior (endpoint verified; live abort requires Discord bot)
- Rollback persistence (DB records verified; rollback-after-restart requires live test)
- Drift detection (live SSE notification verified; persisted drift row not asserted)
- Policy enforcement (CRUD verified; LLM-based policy check requires real API key)
- Performance latency (p95 = 2072 ms, which fails the one-second NFR-8 target)

The weakest areas are the boundaries carrying the greatest real-world risk that remain incompletely
verified: full multi-step Discord convergence, failure injection and rollback, active cancellation,
provider-backed policy behavior, downstream-call isolation after authorization rejection, restart
recovery, the missed read-latency target, deployment reproducibility, and user comprehension.

## 6.8 Strengths, Limitations, and Overall Assessment

The platform has several testability strengths. Its declarative `DesiredState`, pure diff engine,
schema-validated tools, and `ExecuteContext` boundary make substantial planning logic testable
without Discord. Regression cases cover subtle failures such as permission arrays with different
ordering, equal-position role targets, atomic batch permissions, symbol dependencies, and hung
execution steps. The live demonstration also showed an important professional behavior: a Discord
permission failure was displayed honestly and used to drive a correction rather than being hidden.

The current evidence also has material limitations:

- the automated suite is predominantly white-box and implementation-authored;
- mocks replace the database, Discord adapter, LLM provider, and browser in unit tests;
- route coverage remains narrow: template authorization uses mocked route tests, while the plan
  rollback case is a source-text assertion rather than an HTTP execution;
- eight E2E tests require controlled live dependencies and cannot run in CI;
- the recorded demonstration is not a fully reproducible test dataset;
- saved guild rules now guide initial, template-merge, and stale-repair planning, but prompt
  adherence remains probabilistic and current rules must still be revalidated at execution;
- no controlled usability, deployment, or multi-step execution mutation evaluation has been completed;
- terminal planning events are replayed, but intermediate planning and execution events missed
  during a disconnect are not reconstructed, and an in-flight LLM turn cannot resume after restart;
- E2E tests use mock LLM which completes instantly and always calls `ask_user`, preventing full
  plan completion testing without a real LLM API key.

### 6.8.1 Evaluation of planning-stage rule guidance

The planning-stage rule integration implemented in Sections 4.2.4 and 5.8.2 should be evaluated
against an execution-only baseline rather than being accepted merely because the rules appear in a
prompt. Repeated scenarios should include a compatible request, a directly conflicting request,
ambiguous and mutually conflicting rules, a rule change after review, and planning-context
rebuilding during revision, template merge, and stale-plan repair. The expected safety result
remains the same: an unchecked or violating plan must not execute.

The comparison should measure the proportion of first proposals that satisfy the configured rules,
the number of late policy blockers, clarification and re-planning turns, time to an approvable
proposal, token usage, and planning latency. It should also repeat selected cases across supported
models or providers because a planner and validator from the same model family may share failure
modes. These measurements would determine whether earlier guidance provides enough usability and
efficiency benefit to justify its additional prompt and session-state complexity; they would not
replace the fail-closed execution test.

The defensible conclusion is therefore not that the whole system has passed testing. The available
results show that the deterministic core has a functioning regression baseline and that selected
public and live boundaries have been observed. Full compliance with Chapter 3 remains unproven
until the partial and skipped cases in Sections 6.5 and 6.6 are completed against their original
expected outputs. The failed latency case and incomplete cases remain part of the final evidence
rather than being removed or reclassified through post-result thresholds.

## 6.9 Chapter Summary

This chapter evaluated the project using requirement-derived criteria and a deliberately cautious
evidence model. A reproducible Vitest run (Vitest Team, n.d.) collected 208 passing cases across 27 files. These cases
provide credible regression evidence for desired-state manipulation, registered planning tools,
selected diff and validation rules, locks, stream parsing, deadline and abort handling, drift
comparison, and client-side state logic. They do not exercise most production boundaries.

The recorded Discord demonstrations add browser-to-Discord observations: a real permission failure
and corrected execution, stale-plan rejection after an external edit, guild-scoped drift SSE, and
authenticated stream readiness. The controlled Playwright results are reported only for the
assertions actually observed; broader acceptance steps remain partial or skipped, and the p95 read
target was missed. The current overall assessment is therefore partial: the deterministic core and
selected live boundaries are supported by evidence, while the complete deployed workflow still
requires broader measured black-box evaluation.
