import { useState } from "react";
import type { ChannelBase, DesiredState, Role } from "../components/desired-state";

/**
 * Working-copy editing for a DesiredState. Owns the `editing` flag and a
 * cloned `editableState`, plus the seven mutators DesiredStateView expects
 * (patch/delete/add for channels, categories, roles). Callers supply their
 * own save path — the Studio persists to the conversation edit-state
 * endpoint; the TemplateEditor persists the `active` slice via PUT.
 *
 * Items are keyed by id (real Discord id or `$ch_$N` symbol); each mutator
 * rebuilds the parent map with the touched entry replaced in place.
 */
export function useDesiredStateEdit() {
  const [editing, setEditing] = useState(false);
  const [editableState, setEditableState] = useState<DesiredState | null>(null);

  function beginEdit(source: DesiredState) {
    setEditableState(structuredClone(source));
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setEditableState(null);
  }

  function finishEdit() {
    setEditing(false);
    setEditableState(null);
  }

  function patchChannel(id: string, next: ChannelBase) {
    setEditableState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        active: { ...prev.active, channels: { ...prev.active.channels, [id]: next } },
      };
    });
  }

  function patchRole(id: string, next: Role) {
    setEditableState((prev) => {
      if (!prev) return prev;
      return { ...prev, active: { ...prev.active, roles: { ...prev.active.roles, [id]: next } } };
    });
  }

  function deleteChannel(id: string) {
    setEditableState((prev) => {
      if (!prev) return prev;
      const existing = prev.active.channels[id];
      if (!existing) return prev;
      const channels = { ...prev.active.channels };
      delete channels[id];
      return {
        ...prev,
        active: { ...prev.active, channels },
        tombstones: [
          ...prev.tombstones,
          {
            discordId: existing.id,
            resourceType: existing.type === 4 ? ("category" as const) : ("channel" as const),
            name: existing.name,
            deletedInVersion: prev.version,
          },
        ],
      };
    });
  }

  function deleteRole(id: string) {
    setEditableState((prev) => {
      if (!prev) return prev;
      const existing = prev.active.roles[id];
      if (!existing) return prev;
      const roles = { ...prev.active.roles };
      delete roles[id];
      return {
        ...prev,
        active: { ...prev.active, roles },
        tombstones: [
          ...prev.tombstones,
          {
            discordId: existing.id,
            resourceType: "role" as const,
            name: existing.name,
            deletedInVersion: prev.version,
          },
        ],
      };
    });
  }

  function addChannel() {
    setEditableState((prev) => {
      if (!prev) return prev;
      const id = `$ch_${prev.symbolCounter}`;
      return {
        ...prev,
        symbolCounter: prev.symbolCounter + 1,
        active: {
          ...prev.active,
          channels: {
            ...prev.active.channels,
            [id]: {
              id,
              name: "new-channel",
              type: 0,
              parentId: null,
              position: Object.values(prev.active.channels).length,
            },
          },
        },
      };
    });
  }

  function addCategory() {
    setEditableState((prev) => {
      if (!prev) return prev;
      const id = `$cat_${prev.symbolCounter}`;
      return {
        ...prev,
        symbolCounter: prev.symbolCounter + 1,
        active: {
          ...prev.active,
          channels: {
            ...prev.active.channels,
            [id]: {
              id,
              name: "new-category",
              type: 4,
              parentId: null,
              position: Object.values(prev.active.channels).length,
            },
          },
        },
      };
    });
  }

  function addRole() {
    setEditableState((prev) => {
      if (!prev) return prev;
      const id = `$role_${prev.symbolCounter}`;
      return {
        ...prev,
        symbolCounter: prev.symbolCounter + 1,
        active: {
          ...prev.active,
          roles: {
            ...prev.active.roles,
            [id]: {
              id,
              name: "new-role",
              position: Object.values(prev.active.roles).length,
              permissions: [],
              color: 0,
              hoist: false,
              mentionable: false,
            },
          },
        },
      };
    });
  }

  return {
    editing,
    editableState,
    setEditableState,
    beginEdit,
    cancelEdit,
    finishEdit,
    patchChannel,
    patchRole,
    deleteChannel,
    deleteRole,
    addChannel,
    addCategory,
    addRole,
  };
}
