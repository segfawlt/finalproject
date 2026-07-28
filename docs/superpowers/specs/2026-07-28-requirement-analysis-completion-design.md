# Requirement Analysis Completion Design

## Objective

Complete Chapter 3 as an examiner-ready external specification while preserving
the verified behavior and limitations already established in the accuracy pass.
The chapter must give Chapter 4 a stable design baseline and Chapter 6 a set of
requirements that can be tested objectively.

## Scope

This pass modifies only `docs/report/03-requirement-analysis.md` and its
generated use-case diagram assets. It covers:

- measurable acceptance criteria for all non-functional requirements;
- full, consistently structured specifications for UC-1 through UC-17; and
- readable use-case diagrams divided by workflow responsibility.

The pass does not write the traceability matrix or test cases, because those
belong in Chapter 6. It also defers citations, references, introduction text,
and final typesetting as previously agreed.

## Non-Functional Requirement Format

Each NFR will retain its identifier, name, and externally observable statement,
and gain an explicit acceptance criterion. Configured values already present in
the system are used as thresholds: a 30-second per-step execution deadline, a
5-minute overall execution deadline, a 60-second drift-detection interval,
three retry attempts, a 30-minute execution-lock TTL, and a 5-minute stale
heartbeat threshold.

Where no configured value exists, the criterion will define a practical
assessment method instead of inventing an unsupported production guarantee.
Examples include verifying that unauthorised requests are rejected before AI or
Discord work, that secrets do not appear in client responses or logs, and that
representative boundary inputs are rejected by schema validation. Usability
criteria will be framed as evaluation targets for representative tasks, not as
claims that a formal usability study has already passed.

## Use-Case Specification Format

Every use case will use the same fields:

- identifier and goal;
- primary actor and supporting actors;
- linked functional requirements;
- preconditions and trigger;
- numbered main success flow;
- alternative and exception flows;
- postconditions.

The specifications describe behavior visible to users or external systems.
Internal classes, database queries, and algorithms remain in Chapter 4. Safety
limitations that affect the observable outcome—such as best-effort rollback and
uncancellable in-flight Discord requests—remain explicit.

## Diagram Design

The current single diagram will be replaced by three smaller diagrams generated
from PlantUML embedded in the chapter:

1. **Access and planning:** sign-in, server selection, bot invitation, plan
   creation, clarification, cancellation, preview, revision, templates, and
   iteration reversion.
2. **Approval and execution:** validation, approval, execution, abort,
   rollback, and external Discord/LLM relationships.
3. **Monitoring and management:** plan history, drift detection and AI repair,
   rules, and templates.

The diagrams will use only relationships that carry useful meaning. `include`
will represent mandatory reused behavior, `extend` will represent conditional
or optional behavior, and actor associations will show external participation.
Detailed exception paths stay in the textual specifications rather than making
the diagrams unreadable.

## Consistency and Verification

The final chapter will be checked for:

- coverage of FR-1 through FR-28 by at least one use case or explicit business
  rule;
- one complete specification for every UC-1 through UC-17;
- one objectively assessable criterion for every NFR-1 through NFR-23;
- consistency with targeted Discord role-hierarchy checks, execution-stage
  policy validation, and best-effort rollback semantics;
- valid PlantUML source and regenerated SVG output; and
- passing Prettier and `git diff --check` checks.
