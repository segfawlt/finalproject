# Chapter 2: Literature Review

This chapter reviews the concepts, methods, technologies, and existing products that frame the
Discord Platform. The project is not simply a chatbot connected to a Discord bot. It is a
configuration-management system in which natural language captures an administrator's intent,
while a declarative state model, deterministic checks, human approval, and a controlled execution
engine decide what may happen to the live server. The literature is therefore drawn from four
areas: Discord administration, tool-using language models, declarative configuration management,
and safety patterns for long-running external operations.

## 2.1 Background Knowledge

### 2.1.1 Discord servers as configurable systems

Discord calls each server a **guild**. A guild contains channels, categories, roles, members, and
permission settings. Roles grant guild-level capabilities to groups of members, while channel
permission overwrites can allow or deny specific capabilities for a role or member in one channel.
Discord represents permissions as a bitfield and evaluates them through a hierarchy of guild
permissions, role positions, and channel-specific overwrites [1], [2]. Consequently, apparently
simple requests such as "make a private staff section" involve several dependent decisions:

- a staff role must exist;
- the category and its child channels must exist in the intended order;
- the default role must be denied access;
- the staff role must be allowed access; and
- the bot's own role must be high enough to create or modify the target resources.

This dependency structure is important because a server configuration cannot be treated as a list
of unrelated API calls. Creating a channel before its new parent category, or assigning a role
before that role exists, would fail. Permission changes can also have a wider effect than their
small representation suggests. A system that automates Discord administration must therefore
understand resource relationships, ordering, and the bot's authorization boundary.

Discord applications normally use two complementary interfaces. The Gateway is a persistent
WebSocket connection through which Discord sends events such as channel, role, and member changes
[3]. The REST API is used for explicit reads and mutations. Both surfaces are authenticated and
subject to Discord's permission and rate-limit rules [1], [4]. This creates a common systems
trade-off: cached Gateway state is efficient for interactive planning, but a fresh REST read is
more appropriate when correctness at an execution boundary matters.

The human and bot identities are also distinct. OAuth2 authenticates the administrator and exposes
the guilds that the user can access, whereas a bot token identifies the application account that
performs Discord operations [1]. A safe management platform must check both sides: the human must
be authorized to manage the selected guild, and the bot must have sufficient Discord permissions
and role position to carry out the approved change.

### 2.1.2 Natural-language intent and structured action

A natural-language interface lowers the knowledge required to describe a server configuration.
The administrator can express an outcome such as "create a support area for verified members"
without naming REST endpoints, permission bits, or role IDs. However, free-form text is not a safe
execution format. It can be ambiguous, incomplete, or internally inconsistent, and a generative
model may produce different outputs for similar prompts.

Research on language-model agents provides a useful separation between **reasoning about a task**
and **acting through a constrained interface**. ReAct interleaves reasoning with task-specific
actions so that a model can update a plan using observations from its environment [5]. Toolformer
similarly studies models that decide which external API to call, when to call it, and which
arguments to provide [6]. These works motivate tool use, but tool use alone does not guarantee safe
administration. A model-selected function call remains probabilistic output. The receiving system
must still validate its name and arguments, control its effects, and decide whether it is permitted
to run.

For this project, the LLM is best understood as an **intent interpreter and plan author**, not as
the final authority. Its output is restricted to a fixed registry of typed operations. During
planning, those operations modify an imagined server state rather than Discord itself. This
preserves the accessibility of natural language while moving authority into deterministic software
and an explicit human approval step.

### 2.1.3 Declarative configuration and desired state

Declarative systems describe **what state should exist**, rather than prescribing every command
needed to reach it. Kubernetes controllers, for example, observe current state and repeatedly move
managed resources toward desired state [7]. Terraform applies a related plan-first workflow: it
compares configuration with current infrastructure, presents an execution plan, and applies the
reviewed changes later [8]. Both examples show why current state, desired state, and the difference
between them should be separate concepts.

The same model is valuable for Discord administration:

1. read the current guild state;
2. fork it into an editable desired state;
3. change the desired state without mutating Discord;
4. compute the required create, update, move, and delete operations;
5. show those operations to the administrator; and
6. apply only the approved plan.

Unlike Kubernetes, the project is not a continuously authoritative controller that silently
reconciles every difference. Discord administrators may intentionally change a server outside the
platform. The selected approach is therefore **human-triggered convergence**: drift is detected and
reported, but a new or repaired plan must still be reviewed and approved. This retains the benefits
of desired-state modelling without taking control away from the guild's administrators.

## 2.2 Related Technologies and Methodologies

### 2.2.1 Schema-constrained tool calling

Tool calling provides a bridge between language and application logic. Each tool has a name,
description, and parameter schema. The model selects a tool and supplies arguments; application
code validates and handles the call. The important security property is that the model does not
receive a general-purpose Discord client. It can express only the operations exposed by the tool
registry.

The methodology has three boundaries:

- **syntactic boundary:** tool arguments must satisfy a schema;
- **semantic boundary:** the requested mutation must be valid for the current desired state; and
- **authority boundary:** planning a tool must not execute it against Discord.

This project goes beyond the typical reason-act loop described by ReAct [5]. Most structural tools
are deferred: their planning function updates desired state, while their execution function remains
unreachable until the plan has been generated, validated, and approved. The special interaction
tool can pause planning to ask the administrator a question, but it has no Discord side effect.
This distinction prevents conversational uncertainty from becoming an immediate live mutation.

### 2.2.2 Plan, preview, approve, and apply

Terraform's saved-plan workflow illustrates an important control: the reviewed plan can become the
specific artifact later applied, rather than merely an informal preview [8]. The Discord Platform
adopts the same principle as a methodology, although its state model and operations are specific to
Discord.

The separation provides several benefits:

- the administrator can inspect additions, edits, moves, and deletions before execution;
- the same desired state can be revised manually or through another LLM turn;
- deterministic validation can examine the complete plan rather than isolated commands;
- dependencies can be ordered before any mutation begins; and
- the system can record exactly which contract the administrator approved.

Preview is therefore more than a user-interface convenience. It is part of the safety boundary.
The Discord-like visual representation helps the administrator interpret the proposed outcome,
while the explicit step list preserves technical detail for validation and execution.

### 2.2.3 Human-in-the-loop AI and layered assurance

The NIST Generative AI Profile recommends documenting how model output is used and overseen,
combining human oversight with automated evaluation, and maintaining governance throughout the AI
system lifecycle [9]. These recommendations are particularly relevant when model output may cause
external side effects.

No single control is sufficient for this project. Human approval can catch intent errors but may
miss a dangling symbol or Discord constraint. Deterministic validation can prove structural
invariants but cannot reliably interpret every natural-language server policy. An LLM policy check
can interpret flexible rules but should not be trusted as the only guard. The selected assurance
model therefore layers:

1. schema validation at the API and tool boundaries;
2. state-store invariants during planning;
3. a deterministic diff and dependency graph;
4. structural and permission validation before execution;
5. an LLM-assisted check against guild-specific written rules;
6. a human review and approval gate; and
7. stale-state and authorization checks at execution time.

The ordering of the policy check is an implementation limitation discussed in Chapter 4. The
current system performs the guild-rule LLM check at execution rather than making rules part of the
initial planning prompt. The literature supports layered assurance, but it does not imply that two
probabilistic model calls constitute deterministic proof. The hard-coded checks and approval gate
remain necessary.

### 2.2.4 Compensating recovery for external side effects

A Discord execution is a long-running sequence of remote operations, not one database transaction.
Once Discord has accepted a channel deletion or role change, a PostgreSQL rollback cannot undo it.
The Saga pattern addresses a similar problem by decomposing a long-lived transaction into smaller
transactions with compensating actions when later work fails [10].

This project uses the same broad recovery idea but avoids claiming full transactional rollback. It
captures the guild's structural state before execution and, after a failure or rollback request,
computes another diff that attempts to converge the live guild toward that snapshot. This can
recreate channels, roles, overwrites, and member-role assignments, but it cannot restore data that
Discord no longer retains, such as messages in a deleted channel or the original IDs of recreated
resources. A request already dispatched through Discord.js may also settle after the engine stops
waiting. **Best-effort structural convergence** is therefore a more accurate term than atomic
rollback.

### 2.2.5 Server-Sent Events for progress reporting

Planning and execution both produce ordered, server-to-browser progress updates. The browser sends
commands through ordinary HTTP requests, while the server sends turn, step, completion, failure,
and rollback events in one direction. Server-Sent Events (SSE) fit this communication shape: the
HTML standard defines the `EventSource` interface for a server to push events to a web page over an
HTTP event stream [11].

WebSockets would support full-duplex communication, but the project does not require arbitrary
messages in both directions over the same connection. Keeping commands as authenticated REST
requests and progress as SSE reduces protocol and state-management complexity. The trade-off is
that reconnect behavior and missed terminal events must be handled deliberately by the client and
server.

## 2.3 Related Work and Existing Systems

### 2.3.1 Native Discord administration and Server Templates

Discord's native interface is the baseline solution. Administrators can create and edit channels,
roles, categories, and permission overwrites directly. It offers maximum control and immediate
feedback, but a complex setup requires many separate screens and a detailed understanding of
Discord's permission model.

Discord Server Templates reduce repeated setup. A template can clone categories, channels, roles,
and permissions, and Discord provides a preview before creating a server [12]. However, the native
workflow creates a **new** guild from the template. It is not a general plan-and-diff mechanism for
modifying an existing guild. Templates also require manual synchronization when the source changes,
and Discord documents that some community channel types are not transferred [12]. Native templates
therefore solve repeatable initial structure more directly than iterative management of a live
server.

### 2.3.2 Xenon

Xenon is a mature Discord backup, cloning, and template product. Its public documentation describes
loading a template or backup onto an existing guild, including channels, categories, roles, and
permissions [13]. Its backup system can store channels, roles, and server settings by default, with
additional message and member data available in paid tiers [14].

Xenon's strength is recoverability and replication. It can copy structure across guilds and offers
scheduled backups. Its documentation also warns administrators to back up first and review
permissions after loading a template because a load may overwrite settings [13]. The default backup
load replaces channels and roles, although options can narrow that behavior [14]. This workflow is
template- or snapshot-driven rather than a conversational translation of a new intent into a
minimal desired-state diff. Xenon does not document a desired-state model, an iterative
planning conversation, stale-state detection, or a step-level validation pipeline. An
administrator who wants to restructure an existing guild with an ongoing conversation history and
rollback guarantees cannot obtain that from the documented Xenon workflow.

### 2.3.3 AI-assisted Discord builders

AI-assisted server builders now overlap directly with this project's natural-language goal.
BuildMyDiscord publicly describes a "describe, review, deploy" flow in which generated channels,
roles, and permissions are editable before initial deployment [15]. It also provides a tool-using
AI editor for live servers and requires confirmation for destructive operations. Its broader scope
includes an integrated management bot with moderation, onboarding, tickets, and other community
features [15].

BuildMyDiscord does not document a persistent desired-state model, iteration history, stale-state
detection, deterministic whole-plan validation, or a convergent rollback mechanism. An
administrator who wants to inspect the full diff before committing, verify that assumptions still
hold after approval, or recover from a mid-execution failure toward a documented before-snapshot
cannot obtain those guarantees from the reviewed BuildMyDiscord materials.

AiGuild provides another in-Discord approach. Its Discord App Directory listing describes a
prompt-based `/setup` command that generates a server, together with commands for onboarding and
voice statistics [16]. The public listing focuses on generation through slash commands and does not
document a desired-state history, deterministic whole-plan validation, stale-state rejection,
failure compensation, or drift workflow.

The existence of these systems changes the project's novelty claim. Natural-language Discord
generation is not unique. The meaningful distinction is the **control model**: this project applies
the plan-first workflow to both initial and ongoing structural changes, keeps planning side-effect
free, exposes the evolving desired state, validates the complete diff, rejects stale assumptions,
and treats recovery and external drift as first-class concerns.

### 2.3.4 Comparative analysis

The following comparison is limited to capabilities documented by each product's cited public
materials as accessed on July 29, 2026. "Not documented" does not prove that a private or newer
version lacks the capability; it means the capability cannot be credited from the reviewed source.

| System                          | Primary interaction                                       | Existing-guild changes       | Review before mutation                                                                 | Documented recovery model                                                    | Relationship to this project                                                                                    |
| ------------------------------- | --------------------------------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Discord native settings         | Manual graphical settings                                 | Yes, one setting at a time   | The edited form is visible, but there is no whole-change plan                          | Manual correction                                                            | Baseline control and familiarity; high effort for coordinated changes                                           |
| Discord Server Templates        | Template link and preview                                 | No; creates a new guild      | Yes, template preview                                                                  | No rollback workflow documented                                              | Strong for repeatable initial structures, not live-guild reconciliation [12]                                    |
| Xenon                           | Slash commands, backups, and templates                    | Yes                          | Documentation recommends post-load review rather than a full minimal-diff contract     | Snapshot/backup loading                                                      | Stronger backup and content-preservation scope; less focused on conversational intent [13], [14]                |
| BuildMyDiscord                  | Natural-language builder and live AI editor               | Yes                          | Initial generated structure is reviewable; destructive live edits require confirmation | Comparable automatic failure rollback is not documented on the reviewed page | Closest functional competitor; broader management-bot scope, different execution controls [15]                  |
| AiGuild                         | Prompt through Discord slash commands                     | Generates/configures a guild | Not documented in the public listing                                                   | Not documented in the public listing                                         | Lightweight in-Discord generation; less publicly documented planning and recovery detail [16]                   |
| Discord Platform (this project) | Natural-language Studio plus manual desired-state editing | Yes                          | Full desired-state and diff review before every structural execution                   | Before-snapshot, automatic best-effort compensation, and requested rollback  | Narrower than all-in-one management bots; deeper emphasis on plan integrity, validation, stale state, and drift |

The comparison shows that the project should not be evaluated as a replacement for every Discord
administration product. It does not attempt Xenon's message-level archival, BuildMyDiscord's
general management-bot feature set, or the simplicity of a one-click native template. It explores
how AI-authored structural changes can be made inspectable and controllable on an existing guild.

## 2.4 Selected Technologies and Methodologies

### 2.4.1 Selection criteria

Technology selection followed the project's main constraints rather than choosing the largest
framework in each category. The system needed:

- one strongly typed language across browser, API, planning, and shared domain logic;
- direct access to Discord's Gateway and REST behavior;
- relational persistence for users, guild ownership, conversations, plans, and snapshots;
- flexible storage for versioned desired-state and plan documents;
- streaming support for long-running work;
- runtime validation for untrusted API and model output; and
- a deployment model that can run on one commodity host during development and evaluation.

### 2.4.2 Application technology stack

| Layer                  | Selected technology                                  | Rationale and trade-off                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Language and workspace | TypeScript and pnpm workspaces                       | TypeScript provides static checking before execution [17], which is valuable when the same domain contracts cross the web, server, database, and tool layers. pnpm workspaces link local packages into one repository [18]. The trade-off is a compile-time type system that still requires runtime validation at external boundaries.                                                                                                                               |
| Web interface          | React, React Router, Vite, Tailwind CSS, and Zustand | React's component model suits the Studio's independent chat, preview, tab, modal, and sidebar states [19]. Vite provides a fast development server and optimized production build [20]. Tailwind keeps styling colocated through utility classes [21], while Zustand provides a small hook-based store with selector subscriptions [22]. This stack is productive for a SPA but places accessibility, loading-state, and client-state discipline on the application. |
| HTTP API               | Hono on Node.js                                      | Hono uses standard `Request` and `Response` primitives and supports Node through an adapter [23]. Its small routing and middleware surface matches a monolithic API without requiring a larger service framework. The trade-off is that architectural boundaries must be maintained by project structure rather than framework modules.                                                                                                                              |
| Discord integration    | Discord.js v14                                       | Discord.js provides object-oriented access to the Discord API [24], including Gateway caches and REST-backed guild operations. It avoids reimplementing authentication, event handling, resource managers, and permission constants. The application still must handle Discord-specific hierarchy, propagation delay, and non-cancellable in-flight calls.                                                                                                           |
| Persistence            | PostgreSQL and Drizzle ORM                           | PostgreSQL supports relational constraints and transactions together with `jsonb`, whose binary representation is efficient to process and can be indexed [25]. This fits normalized ownership/status data plus versioned plan documents. Drizzle keeps schemas and SQL-like queries in TypeScript [26]. JSONB flexibility is useful, but plan content is less directly queryable than a fully normalized step schema.                                               |
| Authentication         | Better Auth with Discord OAuth2                      | Better Auth is a framework-agnostic TypeScript authentication system with social sign-on and session management [27]. Discord OAuth2 avoids a separate password store and provides the identity needed for guild authorization. Authentication alone is insufficient; every guild route must still check the user's current Manage Server permission.                                                                                                                |
| LLM access             | Raw `fetch` to an OpenAI-compatible endpoint         | OpenRouter exposes an OpenAI-compatible chat-completions API and a broad model catalogue [28]. Using raw HTTP rather than a provider SDK keeps the endpoint, key, and model configurable and reduces coupling. The trade-off is that streaming parsing, errors, aborts, and tool-call accumulation are application responsibilities.                                                                                                                                 |
| Runtime schemas        | Zod                                                  | Zod combines runtime validation with inferred TypeScript types [29]. The same tool schema can validate model arguments and be converted for the LLM's tool definition. It adds a schema layer, but prevents compile-time types from being mistaken for runtime checks.                                                                                                                                                                                               |
| Live progress          | Server-Sent Events                                   | SSE is a web standard for one-way server push [11], which matches planning and execution logs. It is simpler than a bidirectional socket for this flow, but reconnect and event-lifecycle handling remain explicit concerns.                                                                                                                                                                                                                                         |
| Testing                | Vitest                                               | Vitest uses Vite's transform and configuration pipeline [30], giving the TypeScript monorepo a consistent unit-test environment. Discord and database boundaries still require mocks or integration infrastructure; framework convenience does not remove that cost.                                                                                                                                                                                                 |

This stack also supports a simple monorepo boundary: `packages/shared` owns the declarative model,
tool contracts, and validation utilities; `packages/db` owns persistence; `apps/server` owns the API,
planner, execution engine, and Discord bot; and `apps/web` owns the Studio. A microservice split was
not selected because the current scale does not justify distributed transactions, service
discovery, or multiple deployment units. The modular monolith preserves process-local coordination
for planning sessions, guild locks, event buses, and the bot cache.

### 2.4.3 Selected control methodology

The selected methodology can be summarized as **conversational intent, declarative state, and
controlled execution**:

1. **Natural language captures intent.** It is the primary authoring interface, not the executable
   artifact.
2. **Typed tools constrain model output.** Unknown operations and malformed arguments are rejected.
3. **Planning modifies desired state only.** The LLM has no Discord execution context.
4. **A deterministic diff generates the plan.** Ordered steps, dependencies, and symbolic IDs are
   derived from current and desired state.
5. **Preview and iteration precede approval.** The administrator can revise, manually edit, or
   revert without touching Discord.
6. **Validation is layered.** Structural checks, Discord permission rules, a guild-policy check,
   authorization, and stale-state checks cover different failure classes.
7. **Approval binds execution to a reviewed artifact.** Execution does not reinterpret the original
   prompt.
8. **Recovery is compensating, not atomic.** Snapshots support best-effort convergence after failure
   or a later rollback request.
9. **Drift is reported, not silently overwritten.** External changes cause the administrator to
   refresh or explicitly repair the plan.

This methodology is intentionally more conservative than a live AI editor that executes ordinary
changes as soon as they are requested. It adds review latency and implementation complexity, but it
also creates a traceable boundary between probabilistic interpretation and privileged action. That
boundary directly supports the safety, reliability, and maintainability requirements defined in
Chapter 3 and the architecture detailed in Chapter 4.

## 2.5 Project Scope Compared with Similar Systems

The project covers the lifecycle from a natural-language request to a controlled structural change
on an existing Discord guild:

- conversational planning and clarification;
- desired-state preview and current-versus-desired differences;
- revision, manual editing, templates, and iteration history;
- deterministic structural validation and LLM-assisted guild-rule checking;
- explicit approval, stale-state rejection, and per-guild execution locking;
- ordered Discord execution with progress events and transient retries;
- automatic and requested best-effort structural rollback; and
- detection of external drift.

The following areas are deliberately outside the project scope:

- message, attachment, ban, and nickname archival comparable to a dedicated backup service;
- general moderation, ticketing, leveling, welcome, music, or engagement-bot features;
- subscription, billing, and enterprise organization management;
- a public marketplace for globally shared templates;
- replacement of Discord's native client or permission model; and
- a continuously autonomous controller that changes a guild without renewed human approval.

This boundary positions the project between native manual administration and direct AI automation.
Compared with native settings, it reduces the effort of coordinating many related changes. Compared
with native templates, it works with evolving existing guilds rather than only creating a new one.
Compared with Xenon, it gives up deep archival scope in favor of intent-based minimal changes.
Compared with current AI builders, it treats the desired state, complete diff, validation result,
approval, stale-state check, and recovery attempt as explicit parts of every structural change.

The project's contribution is therefore not a claim that AI can generate Discord channels and
roles; existing products already demonstrate that capability. Its contribution is an applied
architecture for placing a declarative, reviewable, and recoverable control plane between an LLM's
interpretation and a privileged Discord bot.
