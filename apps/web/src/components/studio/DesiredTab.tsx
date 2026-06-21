import DesiredStateView from "../DesiredStateView";
import type { DesiredState, ServerState } from "../desired-state/types";

interface DesiredTabProps {
  desiredState: DesiredState | null;
  currentState: ServerState | null;
}

/**
 * Live desired state for the active conversation. Reuses the
 * existing DesiredStateView so the rendering stays consistent with
 * the chat area (same diff badges, same "Will be removed" section,
 * same tombstones).
 */
export default function DesiredTab({ desiredState, currentState }: DesiredTabProps) {
  if (!desiredState) {
    return (
      <div className="p-4">
        <div className="text-shell-text-muted text-sm">
          No plan yet. Send a prompt in the chat to start planning.
        </div>
      </div>
    );
  }
  return (
    <div className="p-4">
      <DesiredStateView desiredState={desiredState} currentState={currentState} />
    </div>
  );
}
