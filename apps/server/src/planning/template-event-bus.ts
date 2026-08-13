export interface TemplateEvent {
  type:
    | "turn_started"
    | "tool_called"
    | "tool_result"
    | "ask_user"
    | "turn_completed"
    | "completed"
    | "error"
    | "cancelled"
    | "expired";
  toolName?: string;
  params?: unknown;
  result?: unknown;
  question?: string;
  options?: { label: string }[];
  multiSelect?: boolean;
  allowCustom?: boolean;
  summary?: string;
  error?: string;
}

type Subscriber = (event: TemplateEvent) => void;
const subscribers = new Map<string, Set<Subscriber>>();
const terminalEvents = new Map<string, TemplateEvent>();
const MAX_REPLAYED_TURNS = 1_000;

export function subscribeToTemplate(turnId: string, callback: Subscriber): () => void {
  if (!subscribers.has(turnId)) subscribers.set(turnId, new Set());
  subscribers.get(turnId)!.add(callback);
  const terminal = terminalEvents.get(turnId);
  if (terminal) callback(terminal);
  return () => {
    subscribers.get(turnId)?.delete(callback);
    if (subscribers.get(turnId)?.size === 0) subscribers.delete(turnId);
  };
}

export function emitTemplateEvent(turnId: string, event: TemplateEvent): void {
  if (["ask_user", "completed", "error", "cancelled", "expired"].includes(event.type)) {
    if (!terminalEvents.has(turnId) && terminalEvents.size >= MAX_REPLAYED_TURNS) {
      const oldest = terminalEvents.keys().next().value;
      if (oldest) terminalEvents.delete(oldest);
    }
    terminalEvents.set(turnId, event);
  } else if (event.type === "turn_started") {
    terminalEvents.delete(turnId);
  }
  for (const callback of subscribers.get(turnId) ?? []) {
    try {
      callback(event);
    } catch {
      subscribers.get(turnId)?.delete(callback);
    }
  }
}

export function clearTemplateEvents(turnId: string): void {
  terminalEvents.delete(turnId);
}
