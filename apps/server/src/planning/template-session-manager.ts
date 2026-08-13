import { TemplateSession } from "./template-session";

interface Entry {
  creatorId: string;
  templateId: string;
  session: TemplateSession;
}

const sessions = new Map<string, Entry>();

export function getTemplateSession(
  turnId: string,
  creatorId: string,
  templateId: string
): TemplateSession | undefined {
  const entry = sessions.get(turnId);
  return entry && entry.creatorId === creatorId && entry.templateId === templateId
    ? entry.session
    : undefined;
}

export function setTemplateSession(
  turnId: string,
  creatorId: string,
  templateId: string,
  session: TemplateSession
): void {
  sessions.set(turnId, { creatorId, templateId, session });
}

export function removeTemplateSession(turnId: string, creatorId: string, templateId: string): void {
  const entry = sessions.get(turnId);
  if (entry?.creatorId === creatorId && entry.templateId === templateId) sessions.delete(turnId);
}
