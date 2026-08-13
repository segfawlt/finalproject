---
title: Load .env for Vitest server suites
category: test-failures
module: root test command
tags: [vitest, dotenv, database-url, environment]
problem_type: build-error
date: 2026-08-10
---

# Load .env for Vitest Server Suites

## Problem

Server tests that import environment-validated modules fail before test collection if `DATABASE_URL`
is absent from the Vitest process environment, even when the repository's root `.env` file exists.

## Symptoms

`pnpm test:run` reports passing assertions but exits unsuccessfully because affected suites fail
during import with:

```text
Required environment variable DATABASE_URL is not set. Copy .env.example to .env and fill in the value.
```

## What Didn't Work

Running `pnpm test:run` directly does not load the root `.env` file. The root test script invokes
`vitest run` directly, whereas server and database package commands explicitly invoke `dotenv`.

## Solution

Load the root environment file before running the complete Vitest suite:

```bash
pnpm exec dotenv -e .env -- pnpm test:run
```

This command completed with all server suites loading and 208 tests passing.

## Why This Works

`dotenv-cli` injects `DATABASE_URL` and the other required values into the child process before
Vitest imports modules that call `validateEnv()`. The import-time guard is therefore satisfied without
weakening production environment validation.

## Prevention

When a suite imports server routes, planning validation, or authentication configuration, run it
through `dotenv -e .env` unless the test explicitly supplies the required environment values. Treat
an import-time missing-variable error as an environment setup failure, not an assertion failure.

## References

5
