import type { PlanResult, Assumption } from "../types";
import { DesiredStateStore } from "../state";
import {
  createCategorySchema,
  editCategorySchema,
  deleteCategorySchema,
  planCategoryCreate,
  planCategoryEdit,
  planCategoryDelete,
  getCategoryCreateAssumptions,
  getCategoryEditAssumptions,
  getCategoryDeleteAssumptions,
} from "./categories";
import {
  createChannelSchema,
  editChannelSchema,
  deleteChannelSchema,
  moveChannelSchema,
  planChannelCreate,
  planChannelEdit,
  planChannelDelete,
  planChannelMove,
  getChannelCreateAssumptions,
  getChannelEditAssumptions,
  getChannelDeleteAssumptions,
  getChannelMoveAssumptions,
} from "./channels";
import {
  createRoleSchema,
  editRoleSchema,
  deleteRoleSchema,
  moveRoleSchema,
  planRoleCreate,
  planRoleEdit,
  planRoleDelete,
  planRoleMove,
  getRoleCreateAssumptions,
  getRoleEditAssumptions,
  getRoleDeleteAssumptions,
  getRoleMoveAssumptions,
} from "./roles";
import {
  setOverwriteSchema,
  removeOverwriteSchema,
  batchSetOverwriteSchema,
  planOverwriteSet,
  planOverwriteRemove,
  planOverwriteBatch,
  getOverwriteSetAssumptions,
  getOverwriteRemoveAssumptions,
  getOverwriteBatchAssumptions,
} from "./permissions";
import {
  createMemberRoleSchema,
  removeMemberRoleSchema,
  planMemberRoleAdd,
  planMemberRoleRemove,
  getMemberRoleAddAssumptions,
  getMemberRoleRemoveAssumptions,
} from "./members";
import { askUserSchema, planAskUser } from "./interaction";

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  executionMode: "planning_only" | "planning_and_execution";
  plan: (params: unknown, store: DesiredStateStore) => PlanResult;
  getAssumptions?: (params: unknown) => Assumption[];
}

/**
 * Unified tool registry. Maps tool names to their Zod schemas (for validation)
 * and plan() functions (for modifying DesiredState).
 *
 * Also provides OpenAI-compatible function definitions for LLM function calling.
 */
export const TOOL_REGISTRY: ToolDefinition[] = [
  {
    name: "create_category",
    description: "Create a new channel category in the server.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Name of the category (1-100 characters)" },
        position: { type: "integer", description: "Sorting position (optional)" },
      },
      required: ["name"],
    },
    executionMode: "planning_and_execution",
    plan: (params, store) => planCategoryCreate(createCategorySchema.parse(params), store),
    getAssumptions: (params) => getCategoryCreateAssumptions(createCategorySchema.parse(params)),
  },
  {
    name: "edit_category",
    description: "Edit an existing channel category. Use this to rename or reposition.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Category ID or symbol" },
        name: { type: "string", description: "New name (optional)" },
        position: { type: "integer", description: "New position (optional)" },
      },
      required: ["id"],
    },
    executionMode: "planning_and_execution",
    plan: (params, store) => planCategoryEdit(editCategorySchema.parse(params), store),
    getAssumptions: (params) => getCategoryEditAssumptions(editCategorySchema.parse(params)),
  },
  {
    name: "delete_category",
    description: "Delete a channel category. All child channels must be moved or deleted first.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Category ID or symbol" },
      },
      required: ["id"],
    },
    executionMode: "planning_and_execution",
    plan: (params, store) => planCategoryDelete(deleteCategorySchema.parse(params), store),
    getAssumptions: (params) => getCategoryDeleteAssumptions(deleteCategorySchema.parse(params)),
  },
  {
    name: "create_channel",
    description: "Create a new channel in the server.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Channel name (1-100 characters)" },
        type: {
          type: "string",
          enum: ["text", "voice", "announcement", "stage", "forum", "media"],
          description: "Channel type",
        },
        parent_id: { type: "string", description: "Parent category ID or symbol (optional)" },
        position: { type: "integer", description: "Sorting position (optional)" },
        topic: { type: "string", description: "Channel topic/description (optional)" },
        bitrate: {
          type: "integer",
          description: "Voice channel bitrate in bits per second (optional, 8000-384000)",
        },
        user_limit: {
          type: "integer",
          description: "Voice channel user limit 0-99 (optional, 0 = unlimited)",
        },
        nsfw: { type: "boolean", description: "Whether the channel is age-restricted (optional)" },
        rate_limit_per_user: {
          type: "integer",
          description: "Slowmode in seconds 0-21600 (optional)",
        },
        available_tags: {
          type: "array",
          description: "Forum/Media channel tags (optional, max 20)",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "Tag name (max 20 characters)" },
              moderated: {
                type: "boolean",
                description: "Whether the tag requires moderation (optional)",
              },
              emoji_id: { type: "string", description: "Emoji ID (optional)" },
              emoji_name: { type: "string", description: "Emoji name (optional)" },
            },
            required: ["name"],
          },
        },
        default_reaction_emoji: {
          type: "object",
          description: "Default reaction emoji for forum/media posts (optional)",
          properties: {
            emoji_id: { type: "string", description: "Emoji ID (optional)" },
            emoji_name: { type: "string", description: "Emoji name (optional)" },
          },
        },
        default_sort_order: {
          type: ["integer", "null"],
          description: "Default sort order: 0 = latest activity, 1 = creation date (optional)",
        },
        default_forum_layout: {
          type: "integer",
          description: "Forum layout: 0 = not set, 1 = list view, 2 = gallery view (optional)",
        },
        default_thread_rate_limit_per_user: {
          type: "integer",
          description: "Slowmode for thread creation in seconds 0-21600 (optional)",
        },
        flags: {
          type: "integer",
          description: "Channel flags bitfield. REQUIRE_TAG = 16 (optional)",
        },
        lock_permissions: {
          type: "boolean",
          description:
            "Sync permissions with parent category. true = inherit category overwrites (default). false = independent. Ignored if no parent_id.",
        },
      },
      required: ["name", "type"],
    },
    executionMode: "planning_and_execution",
    plan: (params, store) => planChannelCreate(createChannelSchema.parse(params), store),
    getAssumptions: (params) => getChannelCreateAssumptions(createChannelSchema.parse(params)),
  },
  {
    name: "edit_channel",
    description:
      "Edit an existing channel. Use this to rename, reparent, " +
      "change settings, or toggle lock_permissions to sync or " +
      "un-sync channel permissions from its parent category.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Channel ID or symbol" },
        name: { type: "string", description: "New name (optional)" },
        type: {
          type: "string",
          enum: ["text", "voice", "announcement", "stage", "forum", "media"],
          description: "Channel type (optional)",
        },
        parent_id: { type: "string", description: "New parent category ID or symbol (optional)" },
        position: { type: "integer", description: "New position (optional)" },
        topic: { type: "string", description: "New topic (optional)" },
        bitrate: { type: "integer", description: "Voice bitrate (optional)" },
        user_limit: { type: "integer", description: "User limit (optional)" },
        nsfw: { type: "boolean", description: "Age-restricted flag (optional)" },
        rate_limit_per_user: { type: "integer", description: "Slowmode (optional)" },
        available_tags: {
          type: "array",
          description: "Forum/Media channel tags (optional, max 20)",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "Tag name (max 20 characters)" },
              moderated: {
                type: "boolean",
                description: "Whether the tag requires moderation (optional)",
              },
              emoji_id: { type: "string", description: "Emoji ID (optional)" },
              emoji_name: { type: "string", description: "Emoji name (optional)" },
            },
            required: ["name"],
          },
        },
        default_reaction_emoji: {
          type: "object",
          description: "Default reaction emoji for forum/media posts (optional)",
          properties: {
            emoji_id: { type: "string", description: "Emoji ID (optional)" },
            emoji_name: { type: "string", description: "Emoji name (optional)" },
          },
        },
        default_sort_order: {
          type: ["integer", "null"],
          description: "Default sort order: 0 = latest activity, 1 = creation date (optional)",
        },
        default_forum_layout: {
          type: "integer",
          description: "Forum layout: 0 = not set, 1 = list view, 2 = gallery view (optional)",
        },
        default_thread_rate_limit_per_user: {
          type: "integer",
          description: "Slowmode for thread creation in seconds 0-21600 (optional)",
        },
        flags: {
          type: "integer",
          description: "Channel flags bitfield. REQUIRE_TAG = 16 (optional)",
        },
        lock_permissions: {
          type: "boolean",
          description:
            "Sync permissions with parent category. true = inherit category overwrites. false = independent.",
        },
      },
      required: ["id"],
    },
    executionMode: "planning_and_execution",
    plan: (params, store) => planChannelEdit(editChannelSchema.parse(params), store),
    getAssumptions: (params) => getChannelEditAssumptions(editChannelSchema.parse(params)),
  },
  {
    name: "delete_channel",
    description: "Delete a channel. This will permanently remove all messages in the channel.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Channel ID or symbol" },
      },
      required: ["id"],
    },
    executionMode: "planning_and_execution",
    plan: (params, store) => planChannelDelete(deleteChannelSchema.parse(params), store),
    getAssumptions: (params) => getChannelDeleteAssumptions(deleteChannelSchema.parse(params)),
  },
  {
    name: "move_channel",
    description: "Move a channel to a different position or parent category.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Channel ID or symbol" },
        position: { type: "integer", description: "New position (optional)" },
        parent_id: { type: "string", description: "New parent category ID or symbol (optional)" },
        lock_permissions: {
          type: "boolean",
          description:
            "Sync permissions with new parent category. true = inherit (default on reparent). false = keep independent.",
        },
      },
      required: ["id"],
    },
    executionMode: "planning_and_execution",
    plan: (params, store) => planChannelMove(moveChannelSchema.parse(params), store),
    getAssumptions: (params) => getChannelMoveAssumptions(moveChannelSchema.parse(params)),
  },
  {
    name: "create_role",
    description: "Create a new role in the server.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Role name (1-100 characters)" },
        permissions: {
          type: "array",
          items: { type: "string" },
          description: "List of permission names (optional)",
        },
        color: { type: "string", description: "Hex color like #FF0000 (optional)" },
        hoist: {
          type: "boolean",
          description: "Display role separately in member list (optional)",
        },
        mentionable: {
          type: "boolean",
          description: "Allow anyone to @mention this role (optional)",
        },
        position: { type: "integer", description: "Role position 0+ (optional)" },
      },
      required: ["name"],
    },
    executionMode: "planning_and_execution",
    plan: (params, store) => planRoleCreate(createRoleSchema.parse(params), store),
    getAssumptions: (params) => getRoleCreateAssumptions(createRoleSchema.parse(params)),
  },
  {
    name: "edit_role",
    description: "Edit an existing role.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Role ID or symbol" },
        name: { type: "string", description: "New name (optional)" },
        permissions: {
          type: "array",
          items: { type: "string" },
          description: "New permission list (optional)",
        },
        color: { type: "string", description: "New hex color (optional)" },
        hoist: { type: "boolean", description: "Display separately (optional)" },
        mentionable: { type: "boolean", description: "Mentionable (optional)" },
        position: { type: "integer", description: "New position (optional)" },
      },
      required: ["id"],
    },
    executionMode: "planning_and_execution",
    plan: (params, store) => planRoleEdit(editRoleSchema.parse(params), store),
    getAssumptions: (params) => getRoleEditAssumptions(editRoleSchema.parse(params)),
  },
  {
    name: "delete_role",
    description: "Delete a role. Members will lose this role.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Role ID or symbol" },
      },
      required: ["id"],
    },
    executionMode: "planning_and_execution",
    plan: (params, store) => planRoleDelete(deleteRoleSchema.parse(params), store),
    getAssumptions: (params) => getRoleDeleteAssumptions(deleteRoleSchema.parse(params)),
  },
  {
    name: "move_role",
    description: "Change a role's position in the hierarchy.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Role ID or symbol" },
        position: { type: "integer", description: "New position (0+)" },
      },
      required: ["id", "position"],
    },
    executionMode: "planning_and_execution",
    plan: (params, store) => planRoleMove(moveRoleSchema.parse(params), store),
    getAssumptions: (params) => getRoleMoveAssumptions(moveRoleSchema.parse(params)),
  },
  {
    name: "add_role_to_member",
    description: "Assign a role to a specific member.",
    parameters: {
      type: "object",
      properties: {
        member_id: { type: "string", description: "Discord user ID of the member" },
        role_id: { type: "string", description: "Role ID or symbol" },
      },
      required: ["member_id", "role_id"],
    },
    executionMode: "planning_and_execution",
    plan: (params, store) => planMemberRoleAdd(createMemberRoleSchema.parse(params), store),
    getAssumptions: (params) => getMemberRoleAddAssumptions(createMemberRoleSchema.parse(params)),
  },
  {
    name: "remove_role_from_member",
    description: "Remove a role from a specific member.",
    parameters: {
      type: "object",
      properties: {
        member_id: { type: "string", description: "Discord user ID of the member" },
        role_id: { type: "string", description: "Role ID or symbol" },
      },
      required: ["member_id", "role_id"],
    },
    executionMode: "planning_and_execution",
    plan: (params, store) => planMemberRoleRemove(removeMemberRoleSchema.parse(params), store),
    getAssumptions: (params) =>
      getMemberRoleRemoveAssumptions(removeMemberRoleSchema.parse(params)),
  },
  {
    name: "set_overwrite",
    description: "Set permission overwrites for a role on a specific channel.",
    parameters: {
      type: "object",
      properties: {
        channel_id: { type: "string", description: "Channel ID or symbol" },
        role_id: { type: "string", description: "Role ID or symbol" },
        allow: {
          type: "array",
          items: { type: "string" },
          description: "Permissions to allow (optional)",
        },
        deny: {
          type: "array",
          items: { type: "string" },
          description: "Permissions to deny (optional)",
        },
      },
      required: ["channel_id", "role_id"],
    },
    executionMode: "planning_and_execution",
    plan: (params, store) => planOverwriteSet(setOverwriteSchema.parse(params), store),
    getAssumptions: (params) => getOverwriteSetAssumptions(setOverwriteSchema.parse(params)),
  },
  {
    name: "remove_overwrite",
    description: "Remove all permission overwrites for a role on a channel.",
    parameters: {
      type: "object",
      properties: {
        channel_id: { type: "string", description: "Channel ID or symbol" },
        role_id: { type: "string", description: "Role ID or symbol" },
      },
      required: ["channel_id", "role_id"],
    },
    executionMode: "planning_and_execution",
    plan: (params, store) => planOverwriteRemove(removeOverwriteSchema.parse(params), store),
    getAssumptions: (params) => getOverwriteRemoveAssumptions(removeOverwriteSchema.parse(params)),
  },
  {
    name: "batch_set_overwrite",
    description:
      "Set multiple permission overwrites at once. Use this when creating a locked-down channel to reduce tool roundtrips.",
    parameters: {
      type: "object",
      properties: {
        overwrites: {
          type: "array",
          description: "List of permission overwrites to apply",
          items: {
            type: "object",
            properties: {
              channel_id: { type: "string", description: "Channel ID or symbol" },
              role_id: { type: "string", description: "Role ID or symbol" },
              allow: {
                type: "array",
                items: { type: "string" },
                description: "Permissions to allow (optional)",
              },
              deny: {
                type: "array",
                items: { type: "string" },
                description: "Permissions to deny (optional)",
              },
            },
            required: ["channel_id", "role_id"],
          },
        },
      },
      required: ["overwrites"],
    },
    executionMode: "planning_only",
    plan: (params, store) => planOverwriteBatch(batchSetOverwriteSchema.parse(params), store),
    getAssumptions: (params) => getOverwriteBatchAssumptions(batchSetOverwriteSchema.parse(params)),
  },
  {
    name: "ask_user",
    description:
      "Ask the user a question to clarify their intent before continuing. Use this when the request is ambiguous or missing critical information.",
    parameters: {
      type: "object",
      properties: {
        question: { type: "string", description: "The question to ask the user" },
        options: {
          type: "array",
          items: { type: "object", properties: { label: { type: "string" } }, required: ["label"] },
          description: "Multiple choice options (optional)",
        },
        multiSelect: { type: "boolean", description: "Allow multiple selections (optional)" },
        allowCustom: { type: "boolean", description: "Allow custom text answer (optional)" },
      },
      required: ["question"],
    },
    executionMode: "planning_only",
    plan: (params, store) => planAskUser(askUserSchema.parse(params), store),
  },
];

/** Lookup a tool by name. Throws if not found. */
export function getTool(name: string): ToolDefinition {
  const tool = TOOL_REGISTRY.find((t) => t.name === name);
  if (!tool) throw new Error(`Unknown tool: ${name}`);
  return tool;
}

/** Get all tool definitions as OpenAI function definitions. */
export function getOpenAIFunctionDefinitions() {
  return TOOL_REGISTRY.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}
