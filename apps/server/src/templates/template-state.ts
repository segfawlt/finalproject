import type { DesiredState } from "@repo/shared";

export type TemplateStructure = DesiredState["active"];

export function emptyTemplateStructure(): TemplateStructure {
  return { channels: {}, roles: {}, overwrites: {}, memberRoles: {} };
}

function asMap(value: unknown): Record<string, never> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, never>)
    : {};
}

export function normalizeTemplateStructure(value: unknown): TemplateStructure {
  const structure = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return {
    channels: asMap(structure.channels),
    roles: asMap(structure.roles),
    overwrites: asMap(structure.overwrites),
    memberRoles: asMap(structure.memberRoles),
  } as TemplateStructure;
}

export function toTemplateDesiredState(
  templateId: string,
  name: string,
  version: number,
  structure: unknown
): DesiredState {
  const active = normalizeTemplateStructure(structure);
  const symbols = Object.keys({ ...active.channels, ...active.roles });
  const greatest = symbols.reduce((max, symbol) => {
    const match = /^\$(?:ch|cat|role)_(\d+)$/.exec(symbol);
    return match ? Math.max(max, Number(match[1])) : max;
  }, -1);

  return {
    guildId: templateId,
    guildName: name,
    active,
    tombstones: [],
    symbolCounter: greatest + 1,
    version,
  };
}

export function fromTemplateDesiredState(state: DesiredState): TemplateStructure {
  return normalizeTemplateStructure(state.active);
}
