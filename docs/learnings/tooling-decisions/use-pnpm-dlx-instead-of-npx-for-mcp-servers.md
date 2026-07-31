---
title: Use pnpm dlx instead of npx for MCP servers
category: tooling-decisions
module: opencode config
tags: [opencode, mcp, npx, pnpm, playwright]
problem_type: tooling-workaround
date: 2026-07-29
---

# Use pnpm dlx Instead of npx for MCP Servers

## Context

OpenCode MCP servers are configured in `opencode.json` with a `command` array. The Playwright MCP docs suggest `["npx", "-y", "@playwright/mcp"]`, but this project uses pnpm and has no standalone `npm`/`npx` binary in PATH.

## Guidance

Use `pnpm dlx` as the equivalent of `npx -y`:

```json
"mcp": {
  "playwright": {
    "type": "local",
    "command": ["pnpm", "dlx", "@playwright/mcp"],
    "enabled": true
  }
}
```

## Why This Matters

`pnpm dlx` downloads and runs a package temporarily, same as `npx -y`. In pnpm-only environments, `npx` is not available and MCP servers will fail to start with "command not found".

## When to Apply

Any time an MCP server configuration uses `npx` in a pnpm workspace without npm installed.

## References

0
