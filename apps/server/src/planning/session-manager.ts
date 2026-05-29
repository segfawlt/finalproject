import { PlanningSession } from "./planning-session";

/**
 * In-memory session tracker for active PlanningSession instances.
 *
 * Server restart destroys all sessions (by design). The user starts a new
 * conversation from the current server state.
 */

interface SessionEntry {
  session: PlanningSession;
  timeout?: NodeJS.Timeout;
}

const sessions = new Map<string, SessionEntry>();

export function getSession(conversationId: string): PlanningSession | undefined {
  return sessions.get(conversationId)?.session;
}

export function setSession(conversationId: string, session: PlanningSession): void {
  sessions.set(conversationId, { session });
}

export function removeSession(conversationId: string): void {
  sessions.delete(conversationId);
}

export function setSessionTimeout(conversationId: string, timeout: NodeJS.Timeout): void {
  const entry = sessions.get(conversationId);
  if (entry) {
    entry.timeout = timeout;
  }
}

export function clearSessionTimeout(conversationId: string): void {
  const entry = sessions.get(conversationId);
  if (entry?.timeout) {
    clearTimeout(entry.timeout);
    entry.timeout = undefined;
  }
}

export function getSessionsByGuild(
  guildId: string
): { conversationId: string; session: PlanningSession }[] {
  const result: { conversationId: string; session: PlanningSession }[] = [];
  for (const [conversationId, entry] of sessions) {
    if (entry.session.guildId === guildId) {
      result.push({ conversationId, session: entry.session });
    }
  }
  return result;
}
