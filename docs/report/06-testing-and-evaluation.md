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
- `independent-system-test-cases.csv` is the execution register for the pending system, security,
  performance, and usability work. Its actual-output and evidence fields remain empty until an
  observation is made.

A `Not yet evaluated` row is a test specification, not a test result. When a pending case is
executed, the tester must record the environment, date, actual output, status, and an evidence path
without replacing the original expected output.

## 6.3 Automated Regression Testing

### 6.3.1 Environment and execution

A fresh automated run was performed on 31 July 2026 against the working tree based on commit
`d82824d`, including the fail-closed policy change described in Chapter 5, with the following
environment:

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
| Server and planning code |         15 |        104 |     104 |      0 |
| Web stores and utilities |          3 |         35 |      35 |      0 |
| **Total**                |     **26** |    **202** | **202** |  **0** |

The executable inventory and fresh result are used here. The full result summary is stored in
`testing/automated-test-results.csv`, with the selected detailed records in
`testing/representative-automated-test-cases.csv`.

### 6.3.2 Representative automated cases

Table 6.2 records representative inputs and outputs from the suite. These cases were selected for
their connection to the system's principal risks rather than to make the table appear exhaustive.

**Table 6.2. Representative automated test cases**

| ID    | Area and input                                                                                                                   | Expected output                                                                             | Actual output                                                                          | Result |
| ----- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------ |
| AT-01 | Convert `VIEW_CHANNEL`, `SEND_MESSAGES`, and `ADMINISTRATOR` to Discord.js-style names                                           | `ViewChannel`, `SendMessages`, and `Administrator`                                          | All values matched                                                                     | Pass   |
| AT-02 | Apply a two-item permission batch in which the second item references `missing-channel`                                          | Throw an error and retain no overwrite from the first item                                  | An error was thrown; the overwrite map remained empty                                  | Pass   |
| AT-03 | Compare a real and desired role whose permission arrays contain the same values                                                  | Generate no `edit_role` step                                                                | No role-edit step was generated                                                        | Pass   |
| AT-04 | Add a new role and assign it to a member in the same desired state                                                               | Place role creation before member assignment and resolve the dependency                     | Two steps were generated in topological order                                          | Pass   |
| AT-05 | Target an existing role at the same hierarchy position as the bot                                                                | Validation fails because Discord requires the bot to be strictly above the target           | Validation returned a blocker                                                          | Pass   |
| AT-06 | Pass a channel symbol where a role identifier is expected                                                                        | Validation rejects the symbol-type mismatch                                                 | Validation returned a blocker                                                          | Pass   |
| AT-07 | Execute a member-role step whose adapter promise never settles, with a 100 ms test deadline                                      | Four total attempts, three retry events, then a terminal plan failure                       | Four calls, three `step_retry` events, and `plan_failed` were recorded                 | Pass   |
| AT-08 | Abort while an adapter promise is still pending                                                                                  | Stop waiting for the step and return a failed result                                        | The result was unsuccessful and a `plan_failed` event was recorded                     | Pass   |
| AT-09 | Acquire a guild lock twice using two plan/owner pairs                                                                            | First acquisition succeeds; second acquisition fails and does not replace the owner         | Returned `true` then `false`; the first plan and owner remained                        | Pass   |
| AT-10 | Parse stream fragments containing `{"name":` and `"staff-chat"}` for a `create_channel` tool call                                | Reconstruct one call with arguments `{"name":"staff-chat"}`                                 | One completed tool call with the expected name and arguments was returned              | Pass   |
| AT-11 | Receive a planning-only `batch_set_overwrite` call followed by a final LLM response                                              | Continue the planning loop without entering `ask_user`; store the overwrite                 | Session reached `completed`, emitted no `ask_user`, and stored the expected permission | Pass   |
| AT-12 | Compare two identical guild projections and then projections containing channel, role, or field differences                      | No drift for identical projections; specific drift events for each difference               | The detector produced the expected empty or specific event sets                        | Pass   |
| AT-13 | Compare current and desired UI data containing changed channel topic, permissions-lock state, role permissions, and member roles | Mark each changed entity as modified                                                        | Client diff utilities classified the expected entities as modified                     | Pass   |
| AT-14 | Inspect the manual rollback handler source                                                                                       | Handler text calls `buildCurrentStateFromDiscord()` rather than the custom-cache projection | The expected source string was present and the cache-builder assignment was absent     | Pass   |
| AT-15 | Evaluate a guild with rules while the key is missing, the provider fails or times out, or output is empty/malformed              | Every unavailable or invalid policy result becomes a block; a no-rule guild skips the call  | Thirteen cases passed, including valid empty, blocker, warning, and availability paths | Pass   |

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
6. The web tests cover stores and pure utilities; there are no rendered `.test.tsx` component tests,
   jsdom interaction tests, or Playwright end-to-end specifications.
7. No statement or branch coverage measurement is configured.
8. The suite was created alongside the implementation and no mutation score or independent
   fault-seeding result has yet been recorded.

Accordingly, “202 passed” is reported as an automated regression result, not as 100% requirement
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
evaluated. They are not marked as passed because no controlled result record currently exists.

**Table 6.3. Independent system and acceptance cases**

| ID    | Requirements                          | Procedure and input                                                                                                  | Expected result                                                                                                                         | Current status    |
| ----- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| ST-01 | FR-1, NFR-10                          | Sign in from a clean browser profile using a dedicated Discord account                                               | Discord OAuth completes; no local password form or password API is exposed                                                              | Not yet evaluated |
| ST-02 | FR-2, FR-4, NFR-11, BR-8              | Request guild data, templates, rules, planning, and execution for a guild the account cannot manage                  | Every request is rejected before guild data, LLM calls, or Discord mutation                                                             | Not yet evaluated |
| ST-03 | FR-5–FR-10, NFR-1, NFR-16, BR-1, BR-7 | Request a category, channels, role, and overwrite; inspect Discord before approval                                   | A matching preview and diff are shown while the normalised live Discord structure remains unchanged                                     | Not yet evaluated |
| ST-04 | FR-17, FR-18, NFR-1                   | Call execution for a draft or otherwise unapproved plan                                                              | Request is rejected and no Discord mutation occurs                                                                                      | Not yet evaluated |
| ST-05 | FR-18, FR-19, NFR-7, NFR-18           | Approve and execute a multi-step independently specified desired state                                               | Ordered events are visible; final Discord structure matches the reviewed state; every mutation corresponds to a stored plan step        | Not yet evaluated |
| ST-06 | FR-3, FR-15, NFR-21, BR-4             | Attempt to edit a role below, equal to, and above the bot's highest role                                             | Only the strictly lower target is permitted; blocked cases make no mutation and explain the hierarchy requirement                       | Not yet evaluated |
| ST-07 | FR-20, NFR-2, BR-9                    | Inject a terminal failure after at least one successful mutation                                                     | Reverse convergence is attempted; the API and UI report success or exact residual divergence; Discord is compared with the before-state | Not yet evaluated |
| ST-08 | FR-21, FR-24, NFR-4, BR-3             | Change Discord after planning and before approval, then try approval and execution                                   | Both operations reject the stale plan and make no further mutation; the user can start confirmed re-planning from fresh state           | Not yet evaluated |
| ST-09 | FR-27                                 | Cancel while the LLM is still generating a plan                                                                      | Generation stops, the conversation reaches a terminal cancelled state, and no plan can execute                                          | Not yet evaluated |
| ST-10 | FR-28, NFR-2, NFR-9                   | Abort a multi-step execution while one step is pending                                                               | No later steps are scheduled; the engine stops waiting, attempts rollback, and reports possible late in-flight effects                  | Not yet evaluated |
| ST-11 | FR-22, NFR-5                          | Restart the server after completed execution, then request rollback using retained snapshots                         | The completed plan and snapshots survive restart and rollback can still be attempted                                                    | Not yet evaluated |
| ST-12 | FR-16, FR-25                          | Create a blocking guild rule; submit a violating plan with the policy provider available, unavailable, and malformed | Valid violations retain their severity; unavailable or malformed evaluation blocks execution; a guild without rules skips the call      | Not yet evaluated |
| ST-13 | FR-14, FR-26, NFR-11                  | Read, edit, attach, and merge a template; repeat read using an unauthorized account                                  | Authorized operations persist correctly; unauthorized reads and writes disclose no guild template data                                  | Not yet evaluated |
| ST-14 | FR-24                                 | Edit a channel directly in Discord and wait for the configured detection interval                                    | A fresh Discord read detects the change, persists one drift event, and notifies only the affected guild                                 | Not yet evaluated |
| ST-15 | NFR-13                                | Complete planning and execution, restart the server, and query the stored history                                    | Conversation, owner, plan data, status, results, and timestamps remain available                                                        | Not yet evaluated |
| ST-16 | NFR-17                                | Trigger permission, stale-state, conflict, timeout, and provider failures                                            | Each response explains the cause and a useful next action rather than exposing only a raw provider code                                 | Not yet evaluated |

Several cases target specific risks found during the implementation review. In particular, ST-02
can expose missing authorization on template reads; ST-07 can detect false
`rollback_completed` reporting; ST-12 verifies the implemented fail-closed rule boundary through a
public flow; and a fast form of ST-03 can reveal planning events emitted before the browser
subscribes. Their expected outcomes come from Chapter 3, not from the current behavior.

## 6.6 Non-Functional Evaluation

### 6.6.1 Performance and responsiveness

The automated suite confirms event ordering and deadline behavior only with constructed streams and
fake timers. It does not measure production latency or concurrency. The following measurements
remain required:

| ID    | Requirement | Workload                                                                                 | Target from Chapter 3                                                | Status                                                                 |
| ----- | ----------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| PF-01 | NFR-7       | One representative planning run and one multi-step execution, recording event timestamps | Progress event appears before the terminal event                     | Not yet evaluated                                                      |
| PF-02 | NFR-8       | Cached state and preview reads under 20 concurrent local clients                         | p95 response time no greater than one second                         | Not yet evaluated                                                      |
| PF-03 | NFR-9       | Hung adapter request and an execution exceeding the overall deadline                     | 30-second step bound and five-minute plan bound, followed by cleanup | Partially supported by shortened unit tests; live timing not evaluated |
| PF-04 | NFR-9       | More than 100 API requests in one minute from one client                                 | Requests beyond the configured window are rate-limited               | Not yet evaluated                                                      |

Each request-level run should be stored separately with its scenario, concurrency, response time,
HTTP status, and error. Median and p95 values should be calculated from those raw records rather
than copied from application logs.

### 6.6.2 Security and privacy

Code inspection shows Discord OAuth, server-side environment configuration, guild authorization
helpers, plan validation, and rate limiting. These controls are design and implementation evidence,
not penetration-test results. NFR-10 to NFR-12 require at least:

- authenticated and unauthenticated route tests;
- cross-guild identifier substitution for every guild-scoped resource;
- inspection of representative HTTP responses, browser bundles, and structured logs using
  synthetic sentinel secrets;
- malformed request bodies and tool arguments at API boundaries; and
- verification that LLM and Discord calls are not made after authorization rejection.

No controlled result set for these checks has yet been recorded. Security compliance is therefore
not claimed.

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

No mutation run has yet been performed. Consequently, the chapter does not infer fault-detection
strength from the number of passing assertions.

## 6.7 Requirements Evaluation

Table 6.4 summarises what the current evidence supports. “Partial” means that code and one or more
isolated tests or captures exist, but the requirement's complete acceptance criterion has not been
demonstrated.

**Table 6.4. Current evidence against requirement groups**

| Requirement group                               | Existing evidence                                                                               | Assessment                                                                                  |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Authentication and guild access (FR-1–FR-4)     | OAuth and guild-picker captures; authorization code inspection                                  | Partial — no controlled unauthorized or cross-guild result                                  |
| Planning and cancellation (FR-5–FR-8, FR-27)    | Mocked planning-session and stream-parser tests; live planning capture                          | Partial — LLM/provider and cancellation flow not independently tested                       |
| Preview and iteration (FR-9–FR-14)              | Desired-state, client-diff, and store tests; preview, iteration, and template captures          | Partial — no rendered UI or side-effect-free black-box test                                 |
| Validation and approval (FR-15–FR-17)           | Fifteen structural-validator tests and thirteen fail-closed policy tests                        | Partial — approval gate and policy behavior are not tested through the public API           |
| Execution and interruption (FR-18–FR-21, FR-28) | Execution-loop tests for two member operations, timeout, and abort; one recorded live execution | Partial — complete adapter coverage, stale rejection, rollback, and abort remain unverified |
| Post-execution and monitoring (FR-22–FR-24)     | Drift-comparison unit tests; stale and rollback captures                                        | Partial — rollback capture required zero reverse steps; drift is not independently fetched  |
| Rule and template management (FR-25–FR-26)      | Fail-closed policy tests, UI captures, and implementation inspection                            | Partial — public-flow policy behavior and template-read isolation remain unverified         |
| Safety and reliability (NFR-1–NFR-6)            | Strong isolated evidence for selected validation, locks, retries, and deadlines                 | Partial — live approval, recovery, persistence, and stale-state criteria not completed      |
| Performance (NFR-7–NFR-9)                       | Constructed event and shortened deadline tests                                                  | Not demonstrated against the stated workload and timing targets                             |
| Security and privacy (NFR-10–NFR-13)            | Architectural controls and implementation inspection                                            | Not independently evaluated                                                                 |
| Usability (NFR-14–NFR-17)                       | UI captures and utility tests                                                                   | Not evaluated with representative users                                                     |
| Architecture and validation (NFR-18–NFR-20)     | Declarative state, registered-tool, schema, diff, and validation tests                          | Partial — public API boundaries and unregistered-model-call rejection need broader tests    |
| Compatibility and deployment (NFR-21–NFR-23)    | Discord.js and configurable LLM adapter implementation                                          | Not demonstrated against two providers or a clean deployment record                         |

The strongest current result is deterministic component behavior: all 202 collected automated
cases pass. The weakest areas are the boundaries carrying the greatest real-world risk:
authorization, browser-to-SSE lifecycle, PostgreSQL persistence, live Discord convergence, rollback
reporting, provider failure, performance, and user comprehension.

## 6.8 Strengths, Limitations, and Overall Assessment

The platform has several testability strengths. Its declarative `DesiredState`, pure diff engine,
schema-validated tools, and `ExecuteContext` boundary make substantial planning logic testable
without Discord. Regression cases cover subtle failures such as permission arrays with different
ordering, equal-position role targets, atomic batch permissions, symbol dependencies, and hung
execution steps. The live demonstration also showed an important professional behavior: a Discord
permission failure was displayed honestly and used to drive a correction rather than being hidden.

The current evidence also has material limitations:

- the automated suite is predominantly white-box and implementation-authored;
- mocks replace the database, Discord adapter, LLM provider, and browser;
- the only route-level test is a source-text assertion;
- there are no rendered component or browser end-to-end tests;
- the recorded demonstration is not a fully reproducible test dataset;
- saved guild rules are enforced at execution but are not supplied to the planner, so a
  rule-conflicting proposal can reach review before being blocked;
- no controlled performance, security, usability, deployment, or mutation evaluation has been
  completed; and
- implementation review has already identified unresolved flows that can affect event delivery,
  template authorization, durable planning completion, rollback reporting, drift freshness, and
  startup ordering.

### 6.8.1 Future evaluation of planning-stage rule guidance

The planning-stage rule integration proposed in Sections 4.2.4 and 5.8.2 should be evaluated
against the current execution-only baseline rather than being accepted merely because the rules
appear in a prompt. Repeated scenarios should include a compatible request, a directly conflicting
request, ambiguous and mutually conflicting rules, a rule change after review, and planning-context
rebuilding during revision, template merge, and stale-plan repair. The expected safety result
remains the same in both designs: an unchecked or violating plan must not execute.

The comparison should measure the proportion of first proposals that satisfy the configured rules,
the number of late policy blockers, clarification and re-planning turns, time to an approvable
proposal, token usage, and planning latency. It should also repeat selected cases across supported
models or providers because a planner and validator from the same model family may share failure
modes. These measurements would determine whether earlier guidance provides enough usability and
efficiency benefit to justify its additional prompt and session-state complexity; they would not
replace the fail-closed execution test.

The defensible conclusion is therefore not that the whole system has passed testing. The available
results show that the deterministic core has a functioning regression baseline and that a limited
live flow has been demonstrated. Full compliance with Chapter 3 remains unproven until the
independent cases in Sections 6.5 and 6.6 are executed and their actual results are recorded. Failed
cases should remain in the final report as limitations and future-work evidence rather than being
removed from the dataset.

## 6.9 Chapter Summary

This chapter evaluated the project using requirement-derived criteria and a deliberately cautious
evidence model. A reproducible Vitest run [30] collected 202 passing cases across 26 files. These cases
provide credible regression evidence for desired-state manipulation, registered planning tools,
selected diff and validation rules, locks, stream parsing, deadline and abort handling, drift
comparison, and client-side state logic. They do not exercise most production boundaries.

The recorded Discord demonstration adds browser-to-Discord observations and documents both a real
permission failure and a later corrected execution, but it was not preserved as a complete
controlled test record. Independent system, security, performance, usability, and mutation cases
have therefore been specified without inventing outcomes. The current overall assessment is
partial: the deterministic core is supported by automated evidence, while the safety and quality of
the complete deployed workflow still requires measured black-box evaluation.
