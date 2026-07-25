# Chapter 3: Requirement Analysis

Requirement analysis describes the external behavior of the system — what the
system does as observed from the outside, by its users and by the external
systems it depends on. It does not describe how the system is built internally;
that is the subject of Chapter 4 (System Design).

The primary user of the system is the **Administrator**: a person who is signed
in through Discord and holds the *Manage Server* permission on the Discord
server (called a *guild*) they want to configure. The system also interacts
with two external systems: the **Discord API** (through a bot) and an
**LLM provider** (an OpenAI-compatible chat-completions endpoint used for
planning and policy checks).

## 3.1 Functional Requirements

Functional requirements state what the system shall let its users do, phrased
as behavior observable from outside the system. Each requirement is given an
identifier (FR-x) so that later chapters — in particular the use case
specifications (Section 3.4) and the test cases (Chapter 6) — can refer to it
directly.

### 3.1.1 Authentication and Access Control

| ID | Requirement | Description |
| --- | --- | --- |
| FR-1 | Sign in with Discord | The system shall let a user sign in using their Discord account (OAuth2). No separate account or password is created. |
| FR-2 | List manageable servers | After signing in, the system shall show the user only the Discord servers on which they hold the *Manage Server* permission. |
| FR-3 | Require an operable bot | The system shall allow configuration of a server only when the platform's bot is a member of that server and holds the *Administrator* permission; otherwise it shall guide the user to invite the bot. |
| FR-4 | Reject unauthorized actions | The system shall reject any planning or execution request for a server the user is not authorized to manage, before any AI or Discord action runs. |

### 3.1.2 Planning from Natural Language

| ID | Requirement | Description |
| --- | --- | --- |
| FR-5 | Submit a request in natural language | The administrator shall be able to describe a desired server change in plain English (for example, "make a Support section with three text channels and a Helper role"). |
| FR-6 | Generate a structured plan | The system shall turn the request into a structured, previewable plan of changes (channels, categories, roles, permissions, member roles) without touching the live server. |
| FR-7 | Ask clarifying questions | When the request is ambiguous, the system shall be able to pause and ask the administrator a clarifying question, then continue once answered. |
| FR-8 | Stream planning progress live | The system shall show the planning progress in real time as the plan is being built, including the actions being added to the plan. |

### 3.1.3 Preview and Iteration

| ID | Requirement | Description |
| --- | --- | --- |
| FR-9 | Preview the desired state | The system shall present the planned result in a Discord-like preview (channels, categories, roles, members) so the administrator can see the outcome before anything is applied. |
| FR-10 | Show the difference from the current server | The preview shall indicate what is added, changed, or removed relative to the server's current state. |
| FR-11 | Revise the plan | The administrator shall be able to send a follow-up instruction to refine the current plan. |
| FR-12 | Revert to an earlier version of the plan | The system shall keep the history of plan iterations and let the administrator restore any earlier iteration. |
| FR-13 | Manually edit the desired state | The administrator shall be able to make manual edits to the planned result in addition to natural-language instructions. |
| FR-14 | Use templates as ideas | The administrator shall be able to attach a saved template to the conversation so the planner can incorporate it into the plan. |

### 3.1.4 Validation and Approval

| ID | Requirement | Description |
| --- | --- | --- |
| FR-15 | Validate structural safety | Before execution, the system shall check the plan for structural problems (for example, referencing a role the bot cannot manage, or two channels with the same name) and block execution if any are found. |
| FR-16 | Validate against server rules | The system shall check the plan against the server's own written rules (a policy check) and surface any violations as blockers or warnings. |
| FR-17 | Approve a plan | The administrator shall be able to approve a reviewed plan, which locks it as the contract to be executed. |

### 3.1.5 Execution

| ID | Requirement | Description |
| --- | --- | --- |
| FR-18 | Execute an approved plan | The administrator shall be able to execute an approved plan, applying the changes to the live Discord server through the bot. |
| FR-19 | Stream execution progress live | During execution, the system shall show a live log of each step as it starts, completes, or fails. |
| FR-20 | Roll back automatically on failure | If a step fails during execution, the system shall automatically undo the steps that already succeeded, leaving the server as it was before. |
| FR-21 | Reject execution on stale state | The system shall refuse to execute a plan if the server has changed since the plan was created, to avoid acting on an out-of-date view. |

### 3.1.6 Post-Execution and Monitoring

| ID | Requirement | Description |
| --- | --- | --- |
| FR-22 | Roll back a completed plan | The administrator shall be able to undo a previously completed plan, restoring the server to its pre-execution state. |
| FR-23 | View plan history | The system shall show a history of past plans and their outcomes for the server. |
| FR-24 | Detect and notify of drift | The system shall detect when the server is changed outside the platform (for example, edited directly in Discord) and notify the administrator, offering to refresh the plan's view of the server. |

### 3.1.7 Rules and Template Management

| ID | Requirement | Description |
| --- | --- | --- |
| FR-25 | Manage server rules | The administrator shall be able to create, edit, and delete the server's written rules that the policy check (FR-16) enforces. |
| FR-26 | Manage templates | The administrator shall be able to create, edit, and delete reusable configuration templates for a server. |

## 3.2 Non-Functional Requirements


### 3.2.1 Safety and Reliability

Safety is the defining quality of this system: it makes changes to live Discord
servers on the user's behalf, so it must never act carelessly.

| ID | Requirement | Description |
| --- | --- | --- |
| NFR-1 | Approval-gated execution | The system shall never apply any change to a live server without explicit human approval of the specific plan. Planning and preview shall have no side effects on Discord. |
| NFR-2 | Atomic rollback on failure | If any execution step fails, the system shall undo all steps that already succeeded, so a failed execution leaves the server in its pre-execution state. |
| NFR-3 | Single execution per server | The system shall ensure that at most one plan executes against a given server at any time, preventing concurrent conflicting changes. |
| NFR-4 | Stale-state protection | The system shall detect when its view of a server is out of date and refuse to approve or execute a plan built on that stale view. |
| NFR-5 | Recoverability | The system shall retain before/after snapshots of executed plans so that a completed change can be reversed after the fact. |
| NFR-6 | Fault tolerance on transient errors | The system shall retry transient failures (rate limits, temporary network or server errors) with backoff before treating a step as failed. |

### 3.2.2 Performance and Responsiveness

| ID | Requirement | Description |
| --- | --- | --- |
| NFR-7 | Real-time feedback | Planning and execution progress shall be streamed to the user as it happens, rather than appearing only after the operation completes. |
| NFR-8 | Low-latency reads during planning | The system shall read a server's current state from an in-memory cache during planning, avoiding per-request calls to Discord and staying within Discord's rate limits. |
| NFR-9 | Bounded long-running operations | Long operations (LLM planning, execution) shall be allowed to run to completion without arbitrary request timeouts, but a stuck execution shall be aborted after a defined limit and its resources released. |

### 3.2.3 Security and Privacy

| ID | Requirement | Description |
| --- | --- | --- |
| NFR-10 | Delegated authentication | The system shall authenticate users through Discord OAuth2 and shall not store user passwords. |
| NFR-11 | Multi-tenant isolation | The system shall isolate each server's data and shall restrict every operation to users authorized for that specific server. |
| NFR-12 | Least-privilege secret handling | Sensitive credentials (the bot token, OAuth secrets, session keys) shall be provided through environment configuration and never exposed to the client or logged in cleartext. |
| NFR-13 | Auditability | The system shall keep a persistent record of conversations, approved plans, and executed changes for later review. |

### 3.2.4 Usability

| ID | Requirement | Description |
| --- | --- | --- |
| NFR-14 | Familiar preview | The preview shall resemble the Discord interface so that administrators can interpret the planned outcome without learning a new visual language. |
| NFR-15 | Natural-language interaction | The primary means of describing changes shall be plain English, requiring no knowledge of the underlying tools or data model. |
| NFR-16 | Reversible exploration | The user shall be able to explore, revise, and revert plans freely, because none of these actions affect the live server until execution. |

### 3.2.5 Maintainability and Architecture

| ID | Requirement | Description |
| --- | --- | --- |
| NFR-17 | Declarative, plan-first design | The system shall represent every intended change as declarative state that is diffed against reality, rather than executing imperative commands directly. |
| NFR-18 | Constrained AI surface | The AI planner shall be able to affect the system only through a fixed, validated set of tools, and shall never reach Discord directly. |
| NFR-19 | Type safety and validation | Inputs crossing system boundaries (tool parameters, API requests) shall be schema-validated. |

### 3.2.6 Compatibility and Portability

| ID | Requirement | Description |
| --- | --- | --- |
| NFR-20 | Discord API compliance | The system shall interact with Discord only through supported bot APIs and shall respect Discord's rate limits and permission model. |
| NFR-21 | Provider-agnostic LLM integration | The system shall integrate with the LLM through a standard OpenAI-compatible interface, so the underlying model or provider can be changed via configuration. |
| NFR-22 | Self-hostable deployment | The system shall be deployable on commodity hardware (a single host with a local database), without dependence on managed or serverless-only services. |
