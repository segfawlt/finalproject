# Chapter 7: Conclusion and Future Work

## 7.1 Achievement of the Project Objectives

This project set out to make substantial Discord configuration easier without
allowing a probabilistic model to act directly on a live community. The resulting
platform implements the complete intended control path from natural-language
request to desired-state planning, preview, validation, approval, execution,
rollback, and drift monitoring. Completion of an implementation path is not,
however, the same as complete verification. Table 7.1 therefore assesses each
objective using the evidence and limitations established in Chapter 6.

**Table 7.1. Achievement of the project objectives**

| Objective                                                                          | Outcome and evidence                                                                                                                                                                                                                                                                                        | Assessment                                                           |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Authenticate through Discord and restrict access to manageable guilds              | Discord OAuth is the only exposed sign-in method. Guild access helpers and protected routes are implemented, and ST-01 and ST-02 exercised the principal public rejection paths. The tests did not instrument every downstream call after rejection.                                                        | Substantially achieved; isolation evidence remains partial           |
| Translate natural language into a structured plan without changing Discord         | Planning sessions use registered tools against a forked desired-state store. Component tests and ST-03 support the side-effect-free boundary, although ST-03 did not independently validate the complete generated preview.                                                                                 | Achieved in implementation; partially demonstrated end to end        |
| Present a Discord-like preview and current-to-desired difference                   | The Studio renders desired channels, categories, roles, members, tombstones, and diff badges. Figures 5.2–5.4 and client utility tests show the interface and supporting logic; no controlled comprehension study was performed.                                                                            | Implemented; usability target not evaluated                          |
| Support revision, manual editing, iteration history, and reversion before approval | Conversation revision, desired-state editing, persisted iterations, and revert routes and controls are implemented. Store and state tests cover isolated behavior, while the complete browser workflow has not been independently executed as one acceptance case.                                          | Implemented; verification remains partial                            |
| Validate structural safety and server rules, then require explicit approval        | Deterministic validation, strict role-hierarchy checks, current guild-rule loading, fail-closed provider handling, and approval gates are implemented and strongly covered by component tests. The complete provider-backed public policy flow and a real draft-plan execution rejection remain incomplete. | Substantially achieved; public-flow evidence remains partial         |
| Execute an approved plan with live progress                                        | The execution engine applies ordered diff steps through a Discord adapter and emits progress over SSE. Recorded captures show execution behavior, but the controlled multi-step ST-05 case was skipped.                                                                                                     | Implemented; not fully demonstrated under controlled live conditions |
| Recover structurally after failure or request, and detect external drift           | Before/after snapshots, diff-based rollback, abort handling, stale checks, and drift polling are implemented. Live stale rejection and drift notification were observed; injected partial failure, residual-divergence reporting, and rollback after restart remain unverified.                             | Partially demonstrated                                               |

The central project objective has therefore been met at the level of a functioning
integrated system: the model proposes state, deterministic software decides what
the proposal means operationally, and a human controls the authority boundary.
The evaluation does not support the stronger claim that every functional and
non-functional acceptance criterion has passed. The detailed position for each
requirement is preserved in Appendix A.

## 7.2 Principal Contribution

The principal contribution is not natural-language generation by itself. Existing
tools can already generate server structures or automate individual Discord
commands. The contribution is the placement of a **declarative, reviewable, and
recoverable control plane** between language-model interpretation and privileged
Discord operations.

Three design choices make that contribution concrete. First, the planner operates
on a forked desired state through a fixed tool registry and has no Discord
execution context. The model can express intent only within the platform's typed
configuration vocabulary. Second, a deterministic diff and validation pipeline
turns that state into an inspectable execution contract. Approval applies to the
specific reviewed plan, and a hash prevents that contract from being used against
a server state that has since changed. Third, execution is treated as a
long-running external operation rather than a database transaction. Locking,
deadlines, retries, snapshots, abort signals, state re-observation, and
best-effort convergence address the fact that Discord mutations can succeed
partially and cannot be atomically reversed.

Together these choices provide a reusable architectural lesson for AI-assisted
administration: probabilistic interpretation can improve the input experience
without being trusted as the final safety or authority mechanism. The same
separation could apply to other configuration domains where users need to review
consequences before an external system changes.

## 7.3 Lessons Learned

### 7.3.1 Keep interpretation separate from authority

The most important boundary was the one between planning and execution. Reusing
the Discord adapter during planning would have made tool calls convenient, but it
would also have made side effects dependent on model behavior. A desired-state
store allowed the same planning vocabulary to remain expressive while keeping the
live system unreachable until deterministic validation and approval had
completed.

### 7.3.2 External state makes reviewed plans temporary

A valid plan is valid only relative to the server state from which it was
derived. Discord can change through its native client, another bot, or another
administrator while a preview is open. Fork hashes, fresh observations before
privileged actions, and confirmed re-planning were therefore not secondary
features; they were necessary to preserve the meaning of approval.

Drift detection also showed that comparing two caches is not always equivalent
to observing an external change. A Discord gateway event updated both the
Discord.js cache and the application's projection before the periodic comparator
ran, leaving equal states and no notification. Emitting drift at the gateway
observation boundary preserved the fact that a change had occurred, while the
periodic comparison remained useful for missed or inconsistent updates. The
general lesson is to capture externally meaningful transitions before normal
cache convergence erases them.

### 7.3.3 Recovery needs truthful semantics

Rollback could not be described honestly as an atomic undo. Deleted Discord
resources may lose data or identifiers, and a request already sent to Discord may
settle after the application stops waiting. The safer design is to re-observe the
guild, calculate a reverse difference toward the retained snapshot, attempt that
convergence, and report any residual divergence. This distinction also changed
how abort and failure messages were implemented and evaluated.

The same precision was required for deadlines. An abort check between execution
steps did not bound a Discord request that never returned, because control could
not reach the next check. The deadline had to wrap each awaited operation. Even
then, racing the operation against a timer or abort signal stops the engine's
wait; it cannot cancel a Discord request that exposes no cancellation hook. A
timeout can be retried as a transient failure, whereas a user or plan abort is a
hard terminal condition. Representing the latter with a distinct error type kept
that invariant independent of mutable error-message wording.

### 7.3.4 Ordering matters in asynchronous workflows

Planning and execution cross the browser, SSE streams, application memory,
PostgreSQL, an LLM provider, and Discord. Small ordering decisions therefore
affected correctness. Terminal planning state had to be persisted before a
completion event was published, and late subscribers required bounded terminal
event replay. Startup recovery also had to finish before accepting requests.
These problems were not visible from the static architecture alone and justified
the iterative, risk-driven development approach selected in Chapter 2.

### 7.3.5 Model distinct states and responsibilities explicitly

Several defects came from using one convenient label or representation for two
different concepts. A `planning_only` tool classification describes whether a
tool may reach execution; it does not say whether the planning loop should pause
for human input. Inferring interaction from that classification caused a batch
permission tool to behave like `ask_user`. The correction made user interaction
an explicit tool behavior rather than a side effect of execution eligibility.

Discord role handling exposed a similar problem. Two separately allocated
permission arrays can represent the same permission set, so reference or ordered
comparison produced unnecessary role edits. Discord hierarchy is also a strict
boundary: possessing `Administrator` does not allow a bot to edit a role at its
own highest position. Structural set comparison removed no-op edits, while a
greater-than-or-equal hierarchy check blocked impossible mutations before
dispatch.

Finally, optional policy must distinguish **absence** from **unavailability**. A
guild with no configured rules has no policy step to perform. A guild with rules
but an unavailable or malformed external evaluator has a policy that could not be
checked; treating those states alike would silently bypass an administrator's
constraint. The implemented fail-closed behavior reflects a broader lesson:
fallback logic must preserve the security meaning of each state, not merely keep
the workflow moving.

### 7.3.6 Passing components do not prove the deployed workflow

The 208 passing automated cases give useful confidence in state manipulation,
diffing, validation, policy failure behavior, retries, locking, and selected UI
logic. They do not reproduce a real provider, browser timing, PostgreSQL restart,
or a Discord guild undergoing a multi-step mutation. Similarly, a passing
Playwright assertion may exercise only part of a broader acceptance case.
Separating runner results from acceptance assessments made the final evaluation
less impressive numerically but more useful and defensible.

### 7.3.7 From direct document editing to constrained state mutation

The earliest design treated the desired server configuration as a JSON document
that the LLM could edit directly, in a similar way to an agentic coding assistant
modifying files in a software repository. This was an attractive starting point:
the document was easy to inspect, version, and compare, and it naturally expressed
the target configuration rather than a sequence of Discord commands. However, it
also placed too much responsibility on the correctness of each model-generated
document replacement. Resource identity, deletion intent, symbol assignment, and
the validity of intermediate mutations were not explicit at the boundary where
the model changed the state.

The design therefore evolved toward a typed tool registry and
`DesiredStateStore`. The LLM still edits a declarative representation in the
conceptual sense, but every mutation is expressed as a domain operation and
validated by application code. This retains the useful properties of the original
idea while adding controlled mutation, snapshots, tombstones, stable identifiers,
and an auditable record of planning actions. It also allows the model's planning
interface to remain separate from the Discord execution interface.

The broader lesson is that unrestricted file-like editing can be a useful mental
model for an AI agent, but it is not always the best application boundary. When a
state model carries safety-critical invariants, a domain-specific mutation layer
can preserve declarative planning while ensuring that the application, rather
than the probabilistic model, owns those invariants.

## 7.4 Limitations and Prioritised Future Work

Future work should close the highest-risk evidence gaps before adding unrelated
features.

1. **Complete controlled live execution and recovery tests.** The first priority
   is a disposable Discord guild and recorded fixture for ST-05–ST-07 and ST-10.
   Tests should execute a representative multi-step plan, inject a failure only
   after a confirmed mutation, exercise active abort, compare normalised
   before/after states, and preserve rollback events and residual differences.
   This would test the platform's main safety claim at the boundary where unit
   mocks are least representative.

2. **Diagnose and repeat the latency measurement.** PF-02 recorded a p95 of
   2072 ms against a one-second target. Profiling should separate application,
   authentication, database, and Playwright-client time before optimisation.
   The original workload should then be repeated on the local reference setup and
   a documented deployment. The target should be revised only prospectively and
   with a usability or operational justification, not to convert the existing
   failure into a pass.

3. **Strengthen public-boundary and interface tests.** Route tests should verify
   guild filtering, approval and execution gates, malformed request bodies,
   cross-guild record access, and the absence of LLM or Discord calls after an
   authorization failure. Rendered React tests should cover approval gating,
   stale warnings, iteration reversion, template and rule actions, execution
   progress, and failure/rollback presentation. These additions are relatively
   small compared with live Discord tests and would close several partial
   assessments without changing production behavior.

4. **Improve restart and event recovery.** A controlled restart test should prove
   retained plan and snapshot availability and manual rollback after restart. The
   current bounded replay protects late subscribers from missing the latest
   terminal planning event, but intermediate events are not reconstructed and an
   in-flight model turn cannot resume after process loss. Durable event offsets or
   persisted workflow checkpoints would be needed for stronger multi-instance and
   restart guarantees. The currently stashed dashboard also leaves historical
   plans without a dedicated user-interface home; a focused plan-history view
   should expose the retained audit data.

5. **Evaluate provider and policy behavior.** The same planning scenarios should
   be run against at least two OpenAI-compatible providers, including tool-call
   fragmentation, timeout, malformed response, and rule-conflict cases. Planning
   with rule guidance should be compared with an execution-only policy baseline
   using first-proposal compliance, clarification turns, late blockers, and time
   to approval. Deterministic and fail-closed execution checks must remain the
   authority boundary regardless of the model result.

6. **Evaluate deployment and human comprehension.** A clean, scripted deployment
   on one commodity host with local PostgreSQL should record migration, startup,
   health, logging, backup, and secret-handling checks. Separately, the small
   studies specified by NFR-14 and NFR-15 should measure whether representative
   Discord administrators correctly understand diff markers and can complete
   configuration tasks using natural language. Their errors and recovery paths
   are more informative than visual preference ratings alone.

These priorities intentionally defer subscriptions, a public template
marketplace, general moderation features, autonomous configuration, and the other
items excluded in Section 1.5. They improve confidence in the defined project
rather than expanding its scope.

## 7.5 Final Conclusion

This project produced an integrated AI-assisted Discord management platform whose
architecture is plan-first rather than command-first. Administrators can express
intent conversationally, inspect and revise a desired configuration, validate it,
approve a fixed plan, and observe controlled execution and recovery behavior. The
model is useful at the interpretation boundary but is deliberately denied direct
authority over Discord.

The evaluation supports strong confidence in the deterministic core and provides
selected evidence at real browser and Discord boundaries. It also identifies a
failed latency target and material incomplete acceptance cases. The appropriate
conclusion is therefore neither that the approach failed nor that the platform is
fully production-proven. The work demonstrates the feasibility and value of a
declarative safety boundary for natural-language administration, while defining
the live execution, recovery, performance, security, compatibility, deployment,
and usability evidence still required for a stronger operational claim.
