---
title: Run PlantUML headlessly during Pandoc DOCX conversion
category: tooling-decisions
module: docs/report
tags: [pandoc, plantuml, docx, java, headless]
problem_type: tooling-workaround
date: 2026-07-29
---

# Run PlantUML Headlessly During Pandoc DOCX Conversion

## Context

The report is converted from Markdown to DOCX with Pandoc's `diagram.lua`
filter. The local PlantUML executable is Java-based and may be invoked in an
environment without an X11 display.

## Guidance

Set Java's headless mode for the conversion command:

```bash
JAVA_TOOL_OPTIONS=-Djava.awt.headless=true pandoc \
  docs/report/02-literature-review.md \
  docs/report/03-requirement-analysis.md \
  docs/report/04-design.md \
  --from=gfm \
  --lua-filter="$HOME/.local/share/pandoc/filters/diagram.lua" \
  -o report2.docx
```

## Why This Matters

Without headless mode, PlantUML can fail with `Can't connect to X11 window
server using ':0'`, leaving diagram images unavailable even though Pandoc
continues processing the document.

## When to Apply

Use this in CI, containers, SSH sessions, or other non-graphical environments
when the Pandoc diagram filter invokes Java-based PlantUML.

## References

0
