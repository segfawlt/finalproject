# Chapter 1: Introduction

This chapter introduces the project. It sets out the context in which the system
was built, the motivation for building it, the specific problem it addresses, the
objectives it pursues, the scope it accepts, and the structure of the remainder of
this report.

## 1.1 Background and Context

Discord is a widely used communication platform organized around **servers**,
known as _guilds_ in Discord's own API. Each server contains channels,
categories, roles, and members. What distinguishes Discord from most other
mainstream chat platforms is the depth and configurability of this structure.
A role grants guild-level capabilities to a group of members; a channel can then
override those capabilities for a specific role or member through a permission
_overwrite_; categories group channels and can propagate their own permissions to
the channels beneath them. Discord evaluates the result through a hierarchy of
guild permissions, role positions, and channel-specific overwrites (Discord, n.d.-a; Discord, n.d.-b).

This configurability is a strength for communities that need fine-grained control,
but it also means that a server's configuration is not a flat list of independent
settings. The pieces are interdependent: a private staff area requires a staff
role to exist, the category and its channels to be created in the right order, the
default role to be denied access, the staff role to be allowed, and the acting
identity to sit high enough in the role hierarchy to make those changes at all.
Chapter 2 (Section 2.1.1) examines this dependency structure in more detail. The
practical consequence for this project is that Discord administration is a
configuration-management problem, not a sequence of unrelated commands.

## 1.2 Motivation

The motivation for this project comes from three observations about managing a
non-trivial Discord server, followed by a fourth about what has recently become
possible.

**Configuration complexity is coupled, and it grows with the server.** Because
roles, categories, channels, and overwrites depend on one another, the effort of
managing a server does not scale linearly with its size. A large community server
can hold dozens of channels and many roles, and each change has to be reasoned
about in relation to the others. It is not that an administrator has "a lot to
learn"; it is that a single intended outcome (a new members-only section, say)
decomposes into several dependent edits that must be made consistently. An
administrator may be comfortable with roles but unsure about per-channel
overwrites, or the reverse, and the coupling means a gap in either area can
produce a subtly wrong result.

**The native client offers no preview and no undo for structural change.**
Discord's built-in administration is _imperative and immediate_. Deleting a
channel removes it and its message history at once, with no dry-run, no summary of
what a change will affect, and no rollback. For a single edit this is acceptable;
for a coordinated change across several roles and channels it means the
administrator is working without a safety net, and any mistake is discovered only
after it has taken effect.

**Configuration drifts as servers and their admin teams evolve.** Real servers
are edited over time, often by more than one administrator, and permissions
accumulate ad hoc. Discord provides no view of what has become inconsistent or
what changed since some earlier point, so even an experienced administrator can
gradually lose a clear picture of their own server. This is the concrete form of
the familiar experience that a long-running server becomes hard to keep clean.

**Large language models make a natural-language control layer newly practical.**
Recent tool-using language models can translate an informal instruction into a
structured, typed set of operations. This makes it feasible to let an
administrator describe an outcome in plain English and have software turn that
into an inspectable plan. This workflow was not practical before models could
reliably emit constrained, schema-valid output (Yao et al., 2023; Schick et al., 2023). The opportunity is therefore to
use an LLM as an _intent interpreter_ while keeping authority over the live server
in deterministic software and an explicit human approval step.

### Why Discord specifically

These observations apply with most force to Discord rather than to other
mainstream chat platforms. Discord has the deepest and most tightly coupled
configuration model among widely used chat platforms: roles and a role hierarchy,
per-channel and per-member permission overwrites, and categories that propagate
permissions, all evaluated together. Platforms such as Slack or Microsoft Teams
expose a comparatively flat and shallow configuration surface, where the payoff of
a plan-and-diff control layer would be small. On Discord the payoff is large,
precisely because the complexity is of the coupled, interdependent kind that a
declarative plan-first system is well suited to relieve. Discord is also a serious
target rather than a toy: it hosts large communities with real stakes around
access control and moderation, and it exposes a capable bot and REST API through
which such a system can actually be built (Discord, n.d.-a; Discord, n.d.-c; Discord, n.d.-d). For these reasons Discord is the
platform where this approach is both most needed and most feasible.

## 1.3 Problem Statement

The problem this project addresses can be stated as follows. An administrator
needs to make structural changes to a live Discord server whose configuration is
complex and interdependent. Expressing those changes directly through Discord's
native interface is laborious and error-prone for coordinated edits, and it offers
no way to preview a change or recover from a mistake. Delegating the changes to an
AI that acts directly on the server would remove the manual effort but introduce a
different risk: a language model can misread intent or fabricate output, and it
would be doing so against a live server that a real community depends on, with the
same lack of preview and recovery.

The problem is therefore not merely to _generate_ Discord configuration from
natural language (existing products already do that; BuildMyDiscord, n.d.; Discord, n.d.-e), but to place a
**declarative, reviewable, and recoverable control plane** between the model's
probabilistic interpretation and the privileged actions that reshape a live guild,
so that natural-language convenience does not come at the cost of safety.

## 1.4 Objectives

The objective of this project is to design and build a platform that lets an
administrator manage an existing Discord server through natural language, while
keeping every change inspectable, validated, and human-approved before it reaches
the live server. Concretely, the system aims to:

- authenticate the administrator through Discord and confine them to servers they
  are authorized to manage;
- translate a natural-language request into a structured plan of changes without
  touching the live server during planning;
- present the planned result as a Discord-like preview together with the
  difference from the server's current state;
- allow the plan to be revised, manually edited, and reverted across iterations
  before approval;
- validate the plan for structural safety, Discord permission constraints, and the
  server's own written rules, and require explicit human approval before execution;
- execute the approved plan against Discord with live progress reporting; and
- attempt best-effort structural recovery after a failure or on request, and detect
  when the live server has drifted from the planned state.

These objectives are made precise as the functional and non-functional
requirements in Chapter 3.

## 1.5 Scope

The project covers the lifecycle from a natural-language request to a controlled
structural change on an _existing_ Discord guild: conversational planning and
clarification, desired-state preview and current-versus-desired differences,
revision and manual editing and iteration history, deterministic structural
validation and an LLM-assisted guild-rule check, explicit approval with
stale-state rejection and per-guild execution locking, ordered execution with
progress events, best-effort structural rollback, and detection of external drift.

The following are deliberately outside the project's scope:

- message, attachment, ban, and nickname archival comparable to a dedicated backup
  service;
- general community-bot features such as moderation, ticketing, leveling, welcome
  flows, music, or engagement;
- subscription, billing, and organization management;
- a public marketplace for globally shared templates;
- replacement of Discord's native client or permission model;
- a continuously autonomous controller that changes a guild without renewed human
  approval;
- an Astro-based landing or documentation site for the platform;
- detailed audit logs of administrative actions; and
- full administrator and user account management.

Section 2.5 positions this scope against comparable systems in more detail.

## 1.6 Report Structure

The remainder of this report is organized as follows.

- **Chapter 2 (Literature Review)** reviews the concepts, technologies, and
  existing systems that frame the project: Discord administration, tool-using
  language models, declarative configuration management, and safety patterns for
  long-running external operations. It also compares software-development
  methodologies and explains the selected development, technology, and control
  approaches.
- **Chapter 3 (Requirement Analysis)** describes the system's external behavior:
  what it does as observed by its users and the external systems it depends on,
  through functional and non-functional requirements, a use case diagram, and use
  case specifications.
- **Chapter 4 (System Design)** turns inward and describes how the system is built
  to meet those requirements, covering the overall architecture, component and
  data design, the key algorithms, the API surface, the user interface, and the
  security design.
- **Chapter 5 (Implementation)** describes how the system was actually built: the
  development environment, the implementation of the main modules, the technical
  problems encountered and the solutions adopted, and evidence of the completed
  system.
- **Chapter 6 (Testing and Evaluation)** describes the testing activities used to
  verify the system's correctness and quality, presents the test cases and their
  results, and evaluates the system against its requirements, including its
  strengths and limitations.
- **Chapter 7 (Conclusion and Future Work)** evaluates the project objectives,
  identifies its principal contribution and lessons, prioritises the work needed
  to close the remaining evidence and implementation gaps, and gives the final
  conclusion.

The appendices provide detailed requirements traceability and the supporting test
registers referred to by the main chapters.
