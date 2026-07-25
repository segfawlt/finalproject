# Final Report — Working Drafts

Drafts of the final project report, one markdown file per chapter. These are
working drafts for iteration, not the final typeset document. Front matter
(title page, abstract, table of contents, lists, glossary) is generated last
because it summarizes finished chapters.

- **Citation style:** IEEE (numbered `[1]`, `[2]` in text; full list in References)
- **Language:** English

## Writing order (not document order)

We write in dependency order — chapters that others build on come first — then
assemble the front matter last. The number prefix on each file is its final
position in the report, not the order we draft it.

Scope is already locked (see "Scope" below); the Introduction prose is written
near the end because its "Chapter 2 presents…" structure paragraph can only be
written once the chapters exist.

| Order | File | Chapter | Status |
| --- | --- | --- | --- |
| 1 | `03-requirement-analysis.md` | Requirement Analysis | drafting |
| 2 | `04-design.md` | System Design | todo |
| 3 | `05-implementation.md` | Implementation | todo |
| 4 | `06-testing-and-evaluation.md` | Testing and Evaluation | todo |
| 5 | `02-literature-review.md` | Literature Review | todo |
| 6 | `01-introduction.md` + `00-abstract.md` | Introduction + Abstract | todo |
| 7 | `00-front-matter.md` | TOC, lists, glossary, abbreviations | todo |
| — | `references.md` | References (grows as we cite) | ongoing |

## Scope (locked)

**In scope:** natural-language → plan → preview → validate → execute → rollback
flow; the Studio web UI (planning, preview, iteration, approval); diff engine;
two-stage validation (code checks + LLM policy check); execution engine with
retry and rollback; drift detection; Discord bot integration; auth and
multi-tenant guild access.

**Out of scope / future work:** Guided Setup wizard (placeholder), in-app
template library browser (stub), Dashboard notification settings (placeholder),
Astro landing/docs site (not built).

## Why this order

- **Requirement Analysis is the backbone.** Design answers *how* each
  requirement is met; Testing writes a test case *per requirement*. Everything
  traces back to it, so it comes first among the core chapters.
- **Literature Review comes late on purpose.** It is easier to review the
  technologies and comparable systems once we know exactly which ones the
  design actually depends on.
- **Introduction is drafted first (scope only), finalized last.** The
  "Chapter 2 presents…" structure paragraph can only be written once the
  chapters exist.

## Source material

Most of the report is assembled from existing project docs rather than written
from scratch:

- `docs/SYSTEM_FLOW.md` — end-to-end behavior, glossary, safety nets
- `docs/design/*.md` — architecture, diff engine, planning, validation, studio
- `docs/IMPLEMENTATION_STATUS.md` — what is actually built (source of truth)
- `packages/db/src/schema.ts` — database design
- test files across the monorepo — testing chapter evidence
