# Presentation Transcript

This is a shorter, plain-language script for the 15-slide presentation. It is
intended to take about ten minutes before the live demo.

## Slide 1 - Title

This project is a way to manage Discord servers using natural language. The
important point is that the AI does not make changes immediately. It first
creates a plan that people can review, check, and approve.

## Slide 2 - What Is a Discord Server?

First, here is the Discord structure that the project manages. A server is a
separate community or organisation. One person can belong to many servers. A
server contains categories, and categories contain channels such as rules,
announcements, support, and general chat. Some channels can also exist outside
a category. The project reads and manages this whole structure.

## Slide 3 - Roles and Permissions

Permissions are more complex because they work in layers. Roles are created at
server level, such as Admin, Moderator, Member, or Guest. Members can have one
or more roles. Then, each channel can add its own rules for a role or for one
person. So a member's access depends on both their roles and the channel they
are trying to use.

## Slide 4 - Why This Problem Matters

Managing this by hand takes time and mistakes can be serious. A wrong
permission can expose a private channel or lock people out. Organisations also
want the same setup to be repeatable, their rules to be checked, and their
changes to be recorded. This is the problem the platform is designed to help
with.

## Slide 5 - Why Direct AI Editing Fails

It may seem easy to ask an AI for JSON and send that JSON to Discord. But
structured output is not automatically safe. A request like "make support
private" still leaves many questions: which roles should keep access, which
members are exceptions, and what should happen to the current permissions?

The JSON may also miss information, use the wrong resource, or be out of date.
The application would then have to guess what the AI meant. Instead, the model
works more like a coding AI agent. It uses typed tool calls, gets feedback,
asks questions when needed, and builds the desired server state step by step.

## Slide 6 - Plan Before Execution

This leads to the main design choice: plan before execution. The user gives a
request. The system builds the target state, compares it with the real server,
checks the changes, and asks the user to approve them. Only after approval does
the bot write to Discord.

## Slide 7 - Declarative DesiredState

The target state is called `DesiredState`. Instead of telling Discord to perform
a blind list of actions, it describes what the server should look like at the
end. This gives the AI, the diff engine, the checks, and the execution code one
shared model to work with.

## Slide 8 - System Architecture and Controlled AI Planning

The project is a TypeScript monorepo. The web client uses React and Vite. The
server uses Hono, and PostgreSQL stores plans, conversations, rules, and
snapshots. Discord.js handles the actual Discord connection. The AI uses an
OpenRouter-compatible service.

The AI does not get unrestricted access to Discord. It can only use the tools
that the application gives it. Those tools change `DesiredState`, not the live
server. This keeps the model useful while keeping the important safety rules in
our own code.

## Slide 9 - Deterministic Diff Engine

Next, the diff engine compares the current server with the desired server. It
works out the smallest set of changes needed. It handles categories, channels,
roles, channel permissions, and member roles. It also puts the changes in the
right order. If something is already correct, it does not create an extra
change.

## Slide 10 - Validation Boundary

Before anything is changed, the plan goes through several checks. These cover
the server structure, permissions, role order, missing dependencies, duplicate
names, channel rules, and the server's own policies. This is a hard boundary:
if the plan is unsafe, it cannot continue to Discord.

## Slide 11 - Fail Closed

For servers with their own rules, the system also checks the plan against those
rules. If the rules cannot be loaded, the check fails, the provider times out,
or the answer is not valid, the plan is blocked. The system does not treat a
missing answer as permission to continue. It is safer to stop than to guess.

## Slide 12 - Safe Execution and Recovery

There are safeguards during the actual change as well. A lock stops two plans
from changing the same server at once. The system checks that the server has
not changed unexpectedly. It retries temporary errors, limits how long it
waits, saves snapshots, and can work out the reverse changes if a rollback is
needed.

## Slide 13 - Drift Detection

The server can also change outside the platform. Someone may edit a role by
hand, or another bot may create a channel. The platform records these changes
and marks an old plan as out of date. It does not blindly apply that plan. It
starts again from the latest server state.

## Slide 14 - Supporting Workflows

The Studio gives administrators one place to discuss a request, view the
desired state, review the changes, and approve them. Templates provide reusable
server structures and useful context for the AI. These features support the
main planning process; they do not replace its checks.

## Slide 15 - Outcome and Demo Handoff

The result is a safer way to use AI for Discord management. The AI helps
understand the request, but it is not allowed to directly control the server.
The plan is visible, checked, approved, and then executed. Discord login,
access checks, saved plans, live updates, and the test suite support the rest
of the system.

I will now show this process in the live demo.
