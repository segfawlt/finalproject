# Open Issues - To Be Resolved Later

## Critical

### 1. Rollback Strategy
- "Inverse plan" is not simply reverse of forward plan
- Some actions are irreversible (deleting messages, removing members)
- Need to define rollback behavior per tool:
  - create_channel → delete_channel (reversible)
  - delete_channel → cannot fully restore (messages lost)
  - edit_channel → edit_channel with old values (reversible)
  - set_overwrite → delete_overwrite or restore old values (reversible)
- Decision: rollback on partial failure vs. leave partial state + report
- Need rollback timeout (don't infinite loop on rollback failures)

### 2. Server Clone Sync Cost
- Full sync of 200 channels + 50 roles + 500 overwrites = ~2 minutes at rate limits
- Need strategy:
  - Option A: Incremental sync (only sync what changed since last sync)
  - Option B: Continuous sync via Gateway events (keep preview server always in sync)
  - Option C: Lazy sync (sync on demand, show loading indicator)
- Preview server lifecycle: creation, maintenance, cleanup policies

## Medium

### 3. Deployment Topology
- Are Web API and Bot Worker one monolith or separate services?
- If separate: Redis/Pub/Sub needed for communication
- If monolith: simpler, but can't scale independently
- Discord.js requires long-running process (can't be serverless)
- Next.js can be serverless or long-running
- Recommendation: start as monolith, split later if needed

### 4. Bot Role Position
- Bot cannot move itself up the role hierarchy
- This is a manual setup step
- Need onboarding flow that guides user to place bot at top
- Bot can detect its position and warn if too low

### 5. Slash Commands vs. !Commands
- `!commands` require Message Content privileged intent (Discord restricts this)
- Slash commands are the modern standard, no privileged intents needed
- Need to decide: slash commands only, or both?
- Slash commands require pre-registration (global or per-guild)
- Dynamic commands (generated from tools) are harder with slash commands

### 6. Webhook/Integration Tools Missing
- Tool registry has no webhook management tools
- Discord servers commonly use webhooks
- Is this intentional scope exclusion or oversight?
- If included: `create_webhook`, `delete_webhook`, `edit_webhook`

## Minor

### 7. Data Retention & Privacy
- Execution plans contain server config data
- How long stored? Can users delete it?
- Need retention policy
- GDPR considerations if EU users

### 8. Error Reporting to User
- When execution fails, how does the user find out?
- Discord message? Web notification? Both?
- Need error notification system
- Should include: what failed, why, suggested fix

### 9. Multi-Server Support
- Can one user manage multiple servers from one dashboard?
- Implied but not specified
- Need guild selector in web UI
- Need per-guild settings and rules

---

## Resolved

### Auth (Discord OAuth2)
- Discord OAuth2 via managed auth service (Better Auth / NextAuth)
- User roles: super_admin, admin, user (ready for multi-admin)
- Permission check: user must have "Manage Server" in Discord
- Subscription tiers: free, pro, enterprise (feature flags per tier)

### LLM Planning for Complex Scenarios
- Template-based planning for complex scenarios (e.g., gaming tournament)
- Templates encode expert knowledge: structure, questions, validation rules
- LLM matches intent → loads template → asks questions → fills template → generates tool calls
- If no template matches: LLM generates from scratch with extra questioning + validation

### Bot Cache vs. Logging
- Bot maintains in-memory cache of server state (channels, roles, permissions)
- Cache updated in real-time via Gateway events
- On restart: fetch full state from Discord API, rebuild cache
- PostgreSQL stores only: plans, snapshots (captured from cache), rules, user data
- Snapshots are for history/rollback, not continuous state tracking

### Plan Assumptions
- Each tool declares what assumptions it makes (name conflicts, parent existence, bot permissions)
- System collects all assumptions from all steps, deduplicates, stores in plan
- Pre-execution checks each assumption against fresh Discord state
- If assumption fails: report conflict, ask user how to proceed

### Clarifying Questions
- LLM can ask user for clarification using `ask_user` tool
- Prevents guessing on vague intents
- Example: "Set up security" → LLM asks "What kind? [Role-based / Anti-raid / Content filtering / All]"

### Expert Validation Layer
- Separate validation layer reviews generated plan
- Catches omissions (e.g., "You have team channels but no team roles")
- Works alongside hard-coded validation and LLM policy check

### Template vs. Symbolic References
- Templates use variables (e.g., `$team_count`) as parameters filled at apply time
- LLM planning uses symbolic references (e.g., `$channel_staff`) as step outputs resolved at execution time
- These are different concepts, now clearly separated

### Novelty Scoring
- Replaced with "user familiarity" — has this user done similar plans before?
- Measured by comparing current intent to user's plan history
