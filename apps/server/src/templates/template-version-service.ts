import { db as defaultDb, templateVersions, templates } from "@repo/db";
import type { DesiredState } from "@repo/shared";
import { and, eq } from "drizzle-orm";
import {
  emptyTemplateStructure,
  fromTemplateDesiredState,
  normalizeTemplateStructure,
  type TemplateStructure,
} from "./template-state";

type Db = typeof defaultDb;
type TemplateRow = typeof templates.$inferSelect;
type VersionSource = "initial" | "manual" | "ai" | "revert";

export class TemplateVersionConflictError extends Error {
  constructor(public readonly currentVersion: number) {
    super(`Template changed at version ${currentVersion}`);
    this.name = "TemplateVersionConflictError";
  }
}

export interface CreateTemplateInput {
  id: string;
  authorId: string;
  name: string;
  description?: string;
  structure?: unknown;
  category?: string | null;
  tags?: string[];
}

export interface ForkTemplateInput {
  templateId: string;
  authorId: string;
  id: string;
  name?: string;
}

export interface TemplateMetadata {
  name?: string;
  description?: string;
  category?: string | null;
  tags?: string[];
}

export interface CommitTemplateInput {
  templateId: string;
  authorId: string;
  structure: unknown | DesiredState;
  expectedVersion: number;
  source: Exclude<VersionSource, "initial">;
  authoringTurnId?: string;
}

export interface RevertTemplateInput {
  templateId: string;
  authorId: string;
  version: number;
  expectedVersion: number;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (!value || typeof value !== "object") return JSON.stringify(value);
  return `{${Object.keys(value as object)
    .sort()
    .map(
      (key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`
    )
    .join(",")}}`;
}

function structureOf(value: unknown): TemplateStructure {
  return normalizeTemplateStructure(
    value && typeof value === "object" && "active" in value ? (value as DesiredState).active : value
  );
}

function cloneStructure(structure: TemplateStructure): TemplateStructure {
  return structuredClone(structure);
}

function lockedTemplate(transaction: Db, templateId: string, authorId: string) {
  return transaction
    .select()
    .from(templates)
    .where(and(eq(templates.id, templateId), eq(templates.authorId, authorId)))
    .for("update");
}

async function nextVersion(
  transaction: Db,
  template: TemplateRow,
  structure: TemplateStructure,
  source: VersionSource,
  authoringTurnId?: string
) {
  const version = template.version + 1;
  await transaction.insert(templateVersions).values({
    templateId: template.id,
    version,
    structure,
    source,
    authoringTurnId,
  });
  const [updated] = await transaction
    .update(templates)
    .set({ structure, version, updatedAt: new Date() })
    .where(eq(templates.id, template.id))
    .returning();
  return updated;
}

async function insertTemplate(
  transaction: Db,
  input: CreateTemplateInput,
  structure: TemplateStructure
) {
  await transaction.insert(templates).values({
    id: input.id,
    authorId: input.authorId,
    name: input.name,
    description: input.description ?? "",
    structure: cloneStructure(structure),
    category: input.category ?? null,
    tags: input.tags ?? [],
    version: 1,
  });
  await transaction.insert(templateVersions).values({
    templateId: input.id,
    version: 1,
    structure: cloneStructure(structure),
    source: "initial",
  });
  const [created] = await transaction.select().from(templates).where(eq(templates.id, input.id));
  return created;
}

export async function createTemplate(input: CreateTemplateInput, database: Db = defaultDb) {
  return database.transaction(async (transaction) => {
    const structure = normalizeTemplateStructure(input.structure ?? emptyTemplateStructure());
    return insertTemplate(transaction as unknown as Db, input, structure);
  });
}

export async function forkTemplate(input: ForkTemplateInput, database: Db = defaultDb) {
  return database.transaction(async (transaction) => {
    const [source] = await transaction
      .select()
      .from(templates)
      .where(and(eq(templates.id, input.templateId), eq(templates.authorId, input.authorId)))
      .for("update");
    if (!source) return undefined;
    return insertTemplate(
      transaction as unknown as Db,
      {
        id: input.id,
        authorId: input.authorId,
        name: input.name ?? `Fork of ${source.name}`,
        description: source.description,
        structure: source.structure,
        category: source.category,
        tags: source.tags,
      },
      cloneStructure(normalizeTemplateStructure(source.structure))
    );
  });
}

export async function updateTemplateMetadata(
  templateId: string,
  authorId: string,
  metadata: TemplateMetadata,
  database: Db = defaultDb
) {
  return database.transaction(async (transaction) => {
    const [template] = await lockedTemplate(transaction as unknown as Db, templateId, authorId);
    if (!template) return undefined;
    const [updated] = await transaction
      .update(templates)
      .set({ ...metadata, updatedAt: new Date() })
      .where(eq(templates.id, templateId))
      .returning();
    return updated;
  });
}

export async function commitTemplateStructure(
  input: CommitTemplateInput,
  database: Db = defaultDb
) {
  return database.transaction(async (transaction) => {
    const [template] = await lockedTemplate(
      transaction as unknown as Db,
      input.templateId,
      input.authorId
    );
    if (!template) return undefined;
    if (template.version !== input.expectedVersion) {
      throw new TemplateVersionConflictError(template.version);
    }
    const structure = structureOf(input.structure);
    if (
      input.source === "ai" &&
      stableStringify(structure) === stableStringify(structureOf(template.structure))
    ) {
      return template;
    }
    return nextVersion(
      transaction as unknown as Db,
      template,
      structure,
      input.source,
      input.authoringTurnId
    );
  });
}

export async function revertTemplateVersion(input: RevertTemplateInput, database: Db = defaultDb) {
  return database.transaction(async (transaction) => {
    const [template] = await lockedTemplate(
      transaction as unknown as Db,
      input.templateId,
      input.authorId
    );
    if (!template) return undefined;
    if (template.version !== input.expectedVersion) {
      throw new TemplateVersionConflictError(template.version);
    }
    const [snapshot] = await transaction
      .select()
      .from(templateVersions)
      .where(
        and(
          eq(templateVersions.templateId, input.templateId),
          eq(templateVersions.version, input.version)
        )
      );
    if (!snapshot) return undefined;
    return nextVersion(
      transaction as unknown as Db,
      template,
      structureOf(snapshot.structure),
      "revert"
    );
  });
}

export { fromTemplateDesiredState };
