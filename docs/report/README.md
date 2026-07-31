# Final Report — Working Drafts

The Markdown chapters in this directory are the authoritative working drafts of
the final report. DOCX files are exports, not source material.

## Rules

- `Report-Structure.md` defines what each chapter must contain.
- Write in English using IEEE numbered citations (`[1]`, `[2]`, and so on).
- Review relevant chapters, documentation, code, and tests before writing. Never
  invent features, behavior, results, citations, screenshots, or implementation
  details.
- Clearly label suggestions as recommendations; never present them as implemented.
- Create `references.md` when the first external source is cited and maintain it
  thereafter.

## Evidence and conflicts

Use the evidence appropriate to the claim; the most detailed source is not
automatically the most authoritative.

| Claim                | Primary evidence                        |
| -------------------- | --------------------------------------- |
| Required behavior    | Locked scope and requirement analysis   |
| Intended structure   | Design documentation                    |
| Implemented behavior | Code, schema, routes, and configuration |
| Verified behavior    | Tests and recorded results              |
| Incomplete work      | Documentation–implementation comparison |

When sources conflict, identify the conflict and choose evidence according to the
claim. Continue with conservative wording when it can be resolved confidently;
tell the user when it materially affects the report's scope, claims, or
credibility. Never silently describe planned work as implemented.

Flag design flaws that make a major claim indefensible. Record non-critical flaws
honestly as limitations or future work rather than fixing them automatically.
Keep minor improvement ideas optional and separate from the factual report.

## Continuity

Before adding a section, review the relevant earlier chapters. Preserve established
terminology, requirement and use-case identifiers, scope, and architectural claims.
Use transitions and cross-references where useful without repeating whole sections.
Maintain the chain from requirements → design → implementation → testing.

## Drafting strategy

Write in dependency order; filename prefixes indicate final chapter order only.

- Treat Requirement Analysis as the backbone for design and testing.
- Draft Literature Review background and related work early; finalize technology
  and similar-system comparisons after the design stabilizes.
- Finalize the Introduction and Abstract after the core chapters.
- Assemble the title page, contents, lists, glossary, and abbreviations last.

Determine progress from the chapter files and current task, not a status table.

## Scope (locked)

**In scope:** natural-language → plan → preview → validate → execute → rollback;
Studio planning, preview, iteration, and approval; diff engine; code and LLM
validation; retrying execution and rollback; drift detection; Discord bot;
authentication and multi-tenant guild access.

**Out of scope / future work:** Astro landing/docs site, subscription and billing,
detailed audit logs, and full admin/user management.

## Source material

- `Report-Structure.md` — chapter rubric
- `docs/SYSTEM_FLOW.md` and `docs/design/*.md` — flows and design
- `docs/IMPLEMENTATION_STATUS.md` — implementation inventory and gaps
- Source code and `packages/db/src/schema.ts` — as-built evidence
- Test files — verification evidence
