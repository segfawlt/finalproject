import { z } from "zod";

export const DISCORD_PERMISSIONS = {
  CREATE_INSTANT_INVITE: { bit: 1n, description: "Create instant invites" },
  KICK_MEMBERS: { bit: 2n, description: "Kick members" },
  BAN_MEMBERS: { bit: 4n, description: "Ban members" },
  ADMINISTRATOR: {
    bit: 8n,
    description: "Administrator — all permissions, bypasses channel overwrites",
  },
  MANAGE_CHANNELS: { bit: 16n, description: "Manage channels" },
  MANAGE_GUILD: { bit: 32n, description: "Manage server" },
  ADD_REACTIONS: { bit: 64n, description: "Add reactions" },
  VIEW_AUDIT_LOG: { bit: 128n, description: "View audit log" },
  PRIORITY_SPEAKER: { bit: 256n, description: "Priority speaker" },
  STREAM: { bit: 512n, description: "Stream video" },
  VIEW_CHANNEL: { bit: 1024n, description: "View channel" },
  SEND_MESSAGES: { bit: 2048n, description: "Send messages" },
  SEND_TTS_MESSAGES: { bit: 4096n, description: "Send TTS messages" },
  MANAGE_MESSAGES: { bit: 8192n, description: "Manage messages" },
  EMBED_LINKS: { bit: 16384n, description: "Embed links" },
  ATTACH_FILES: { bit: 32768n, description: "Attach files" },
  READ_MESSAGE_HISTORY: { bit: 65536n, description: "Read message history" },
  MENTION_EVERYONE: { bit: 131072n, description: "Mention @everyone, @here, and all roles" },
  USE_EXTERNAL_EMOJIS: { bit: 262144n, description: "Use external emojis" },
  VIEW_GUILD_INSIGHT: { bit: 524288n, description: "View server insights" },
  CONNECT: { bit: 1048576n, description: "Connect to voice channel" },
  SPEAK: { bit: 2097152n, description: "Speak in voice channel" },
  MUTE_MEMBERS: { bit: 4194304n, description: "Mute members" },
  DEAFEN_MEMBERS: { bit: 8388608n, description: "Deafen members" },
  MOVE_MEMBERS: { bit: 16777216n, description: "Move members between voice channels" },
  USE_VAD: { bit: 33554432n, description: "Use voice activity detection" },
  CHANGE_NICKNAME: { bit: 67108864n, description: "Change own nickname" },
  MANAGE_NICKNAMES: { bit: 134217728n, description: "Manage nicknames" },
  MANAGE_ROLES: { bit: 268435456n, description: "Manage roles" },
  MANAGE_WEBHOOKS: { bit: 536870912n, description: "Manage webhooks" },
  MANAGE_EMOJI: { bit: 1073741824n, description: "Manage emojis and stickers" },
  USE_APPLICATION_COMMANDS: {
    bit: 2147483648n,
    description: "Use application commands (slash commands)",
  },
  REQUEST_TO_SPEAK: { bit: 4294967296n, description: "Request to speak in stage channels" },
  MANAGE_EVENTS: { bit: 8589934592n, description: "Manage server events" },
  MANAGE_THREADS: { bit: 17179869184n, description: "Manage threads" },
  CREATE_PUBLIC_THREADS: { bit: 34359738368n, description: "Create public threads" },
  CREATE_PRIVATE_THREADS: { bit: 68719476736n, description: "Create private threads" },
  USE_EXTERNAL_STICKERS: { bit: 137438953472n, description: "Use external stickers" },
  SEND_MESSAGES_IN_THREADS: { bit: 274877906944n, description: "Send messages in threads" },
  USE_EMBEDDED_ACTIVITIES: {
    bit: 549755813888n,
    description: "Use embedded activities (games/activities)",
  },
  MODERATE_MEMBERS: { bit: 1099511627776n, description: "Time out members" },
} as const;

export type DiscordPermissionName = keyof typeof DISCORD_PERMISSIONS;

export const permissionNameSchema = z.string().refine(
  (name) => name in DISCORD_PERMISSIONS,
  (name) => ({ message: `Unknown permission name: ${name}` })
);

/**
 * Convert a Discord permission bitfield string to an array of permission names.
 * If the input looks like a comma-joined name list (contains letters, not just digits),
 * it is split directly. This handles both numeric bitfields and already-converted names.
 */
export function bitfieldToPermissionNames(bitfield: string): string[] {
  // If already names (contains commas or alphabetic chars), split directly
  if (/[a-zA-Z_,]/.test(bitfield)) {
    return bitfield.split(",").filter(Boolean);
  }

  const names: string[] = [];
  try {
    const bits = BigInt(bitfield);
    for (const [name, { bit }] of Object.entries(DISCORD_PERMISSIONS)) {
      if (bits & bit) names.push(name);
    }
  } catch {
    return [];
  }
  return names;
}

/**
 * Convert an array of permission names to a Discord permission bitfield string.
 */
export function permissionNamesToBitfield(names: string[]): string {
  let bits = 0n;
  for (const name of names) {
    const entry = DISCORD_PERMISSIONS[name as DiscordPermissionName];
    if (entry) {
      bits |= entry.bit;
    }
  }
  return bits.toString();
}

export const CHANNEL_TYPES = {
  0: "text",
  2: "voice",
  4: "category",
  5: "announcement",
  13: "stage",
  15: "forum",
  16: "media",
} as const;

export type DiscordChannelType = keyof typeof CHANNEL_TYPES;

export const PLAN_STATUSES = [
  "draft",
  "validated",
  "approved",
  "executing",
  "completed",
  "failed",
  "rolled_back",
] as const;

/**
 * Convert a SCREAMING_SNAKE_CASE permission name to PascalCase for
 * Discord.js PermissionFlagsBits lookup.
 */
export function toPascalCase(str: string): string {
  return str
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

export const STEP_STATUSES = ["pending", "in_progress", "completed", "failed", "skipped"] as const;

export const SNAPSHOT_TYPES = [
  "execution_before",
  "execution_after",
  "role_deletion",
  "plan_state",
] as const;
