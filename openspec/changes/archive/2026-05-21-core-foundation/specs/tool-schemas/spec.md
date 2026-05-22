## ADDED Requirements

### Requirement: Category tool schemas

The `packages/shared` package SHALL export Zod schemas for `createCategorySchema`, `editCategorySchema`, and `deleteCategorySchema`. These schemas SHALL validate tool parameters for the planning layer.

#### Scenario: createCategorySchema validates required fields

- **WHEN** `createCategorySchema.parse()` is called with `{ name: "General" }`
- **THEN** it returns a valid object and does not throw

#### Scenario: createCategorySchema rejects empty name

- **WHEN** `createCategorySchema.parse()` is called with `{ name: "" }`
- **THEN** Zod throws a validation error

#### Scenario: editCategorySchema requires category id

- **WHEN** `editCategorySchema.parse()` is called without `id`
- **THEN** Zod throws a validation error

#### Scenario: deleteCategorySchema requires only id

- **WHEN** `deleteCategorySchema.parse()` is called with `{ id: "123" }`
- **THEN** it returns a valid object

### Requirement: Channel tool schemas

The `packages/shared` package SHALL export Zod schemas for `createChannelSchema`, `editChannelSchema`, `deleteChannelSchema`, and `moveChannelSchema`.

#### Scenario: createChannelSchema validates channel type

- **WHEN** `createChannelSchema.parse()` is called with `{ name: "chat", type: "text" }`
- **THEN** it returns a valid object

#### Scenario: createChannelSchema rejects invalid type

- **WHEN** `createChannelSchema.parse()` is called with `{ name: "chat", type: "invalid" }`
- **THEN** Zod throws a validation error

#### Scenario: createChannelSchema accepts optional parent_id and topic

- **WHEN** `createChannelSchema.parse()` is called with `{ name: "chat", type: "text", parent_id: "$cat_0", topic: "Discuss" }`
- **THEN** it returns a valid object with all fields

#### Scenario: moveChannelSchema requires id and new position or parent

- **WHEN** `moveChannelSchema.parse()` is called with `{ id: "123", position: 3 }`
- **THEN** it returns a valid object

### Requirement: Role tool schemas

The `packages/shared` package SHALL export Zod schemas for `createRoleSchema`, `editRoleSchema`, `deleteRoleSchema`, and `moveRoleSchema`.

#### Scenario: createRoleSchema validates permissions as string array

- **WHEN** `createRoleSchema.parse()` is called with `{ name: "Moderator", permissions: ["MANAGE_MESSAGES", "KICK_MEMBERS"] }`
- **THEN** it returns a valid object

#### Scenario: createRoleSchema accepts optional color

- **WHEN** `createRoleSchema.parse()` is called with `{ name: "Moderator", permissions: ["MANAGE_MESSAGES"], color: "#FF0000" }`
- **THEN** it returns a valid object with color field

#### Scenario: editRoleSchema requires id

- **WHEN** `editRoleSchema.parse()` is called without `id`
- **THEN** Zod throws a validation error

### Requirement: Permission tool schemas

The `packages/shared` package SHALL export Zod schemas for `setOverwriteSchema` and `removeOverwriteSchema`.

#### Scenario: setOverwriteSchema validates allow/deny permissions

- **WHEN** `setOverwriteSchema.parse()` is called with `{ channel_id: "123", role_id: "456", allow: ["VIEW_CHANNEL"], deny: ["SEND_MESSAGES"] }`
- **THEN** it returns a valid object

#### Scenario: removeOverwriteSchema requires only channel_id and role_id

- **WHEN** `removeOverwriteSchema.parse()` is called with `{ channel_id: "123", role_id: "456" }`
- **THEN** it returns a valid object

### Requirement: ask_user tool schema

The `packages/shared` package SHALL export an `askUserSchema` Zod schema for the interaction tool. The schema SHALL support multiple choice questions with optional multi-select and custom input.

#### Scenario: askUserSchema accepts question and options

- **WHEN** `askUserSchema.parse()` is called with `{ question: "What kind?", options: [{ label: "A" }, { label: "B" }] }`
- **THEN** it returns a valid object

#### Scenario: askUserSchema accepts multi-select flag

- **WHEN** `askUserSchema.parse()` is called with `{ question: "Select", options: [{ label: "X" }], multiSelect: true }`
- **THEN** it returns a valid object with multiSelect set to true

#### Scenario: askUserSchema accepts custom input flag

- **WHEN** `askUserSchema.parse()` is called with `{ question: "Or", options: [], allowCustom: true }`
- **THEN** it returns a valid object with allowCustom set to true

### Requirement: Tool schemas are re-exported from index

The `packages/shared` package SHALL re-export all tool schemas from `src/tools/index.ts` so consumers can import them from a single entry point.

#### Scenario: All schemas importable from shared

- **WHEN** `import { createChannelSchema, createRoleSchema, askUserSchema } from "@repo/shared"` is used
- **THEN** all three schemas are available as ZodObject instances
