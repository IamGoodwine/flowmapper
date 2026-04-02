/**
 * Multi-level Undo/Redo system for FlowMapper.
 *
 * Tracks: deletion, reconnect, move, create-node, edit-node, create-connection, edit-connection, and layout actions.
 */
import type { Screen, Connection, FlowType } from "./types";
import type { Section } from "./types";

// ─── Action types ───────────────────────────────────────────
export interface DeletionAction {
  type: "deletion";
  screens: Screen[];
  connections: Connection[];
  label: string;
}

export interface ReconnectAction {
  type: "reconnect";
  connectionId: string;
  oldSourceId: string;
  oldDestId: string;
  newSourceId: string;
  newDestId: string;
  oldCondition?: "yes" | "no";
  newCondition?: "yes" | "no";
  label: string;
}

export interface MoveAction {
  type: "move";
  /** Nodes that were moved, with their before/after positions */
  movedNodes: { id: string; oldX: number; oldY: number; newX: number; newY: number }[];
  label: string;
}

export interface CreateConnectionAction {
  type: "create_connection";
  connection: Connection;
  label: string;
}

export interface EditConnectionAction {
  type: "edit_connection";
  connectionId: string;
  oldTrigger: string;
  oldReason: string | undefined;
  oldFlowType: FlowType;
  newTrigger: string;
  newReason: string | undefined;
  newFlowType: FlowType;
  label: string;
}

export interface CreateNodeAction {
  type: "create_node";
  node: Screen;
  label: string;
}

export interface EditNodeAction {
  type: "edit_node";
  nodeId: string;
  oldValues: Partial<Screen>;
  newValues: Partial<Screen>;
  label: string;
}

export interface CreateSectionAction {
  type: "create_section";
  section: Section;
  label: string;
}

export interface DeleteSectionAction {
  type: "delete_section";
  section: Section;
  label: string;
}

export interface MoveSectionAction {
  type: "move_section";
  sectionId: string;
  oldX: number;
  oldY: number;
  newX: number;
  newY: number;
  /** Nodes that moved along with the section */
  movedNodes: { id: string; oldX: number; oldY: number; newX: number; newY: number }[];
  label: string;
}

export interface ResizeSectionAction {
  type: "resize_section";
  sectionId: string;
  oldX: number; oldY: number; oldW: number; oldH: number;
  newX: number; newY: number; newW: number; newH: number;
  label: string;
}

export interface EditSectionAction {
  type: "edit_section";
  sectionId: string;
  oldName: string;
  oldColor: string;
  newName: string;
  newColor: string;
  label: string;
}

export type UndoAction = DeletionAction | ReconnectAction | MoveAction | CreateNodeAction | EditNodeAction | CreateConnectionAction | EditConnectionAction | CreateSectionAction | DeleteSectionAction | MoveSectionAction | ResizeSectionAction | EditSectionAction;

// ─── Stack helpers ──────────────────────────────────────────
export const MAX_UNDO = 50;

/** Push an action onto a stack (returns new array, capped at MAX_UNDO). */
export function pushAction(stack: UndoAction[], action: UndoAction): UndoAction[] {
  const next = [...stack, action];
  return next.length > MAX_UNDO ? next.slice(next.length - MAX_UNDO) : next;
}

/** Pop the last action from a stack (returns [newStack, poppedAction | null]). */
export function popAction(stack: UndoAction[]): [UndoAction[], UndoAction | null] {
  if (stack.length === 0) return [stack, null];
  return [stack.slice(0, -1), stack[stack.length - 1]];
}

// ─── Toast description helpers ──────────────────────────────
export function describeAction(action: UndoAction): string {
  switch (action.type) {
    case "deletion":
      return `Eliminato ${action.label}`;
    case "reconnect":
      return `Ricollegato ${action.label}`;
    case "move":
      return `Spostato ${action.label}`;
    case "create_connection":
      return `Creata connessione ${action.label}`;
    case "create_node":
      return `Creato ${action.label}`;
    case "edit_node":
      return `Modificato ${action.label}`;
    case "edit_connection":
      return `Modificata connessione ${action.label}`;
    case "create_section":
      return `Creato ${action.label}`;
    case "delete_section":
      return `Eliminato ${action.label}`;
    case "move_section":
      return `Spostato ${action.label}`;
    case "resize_section":
      return `Ridimensionato ${action.label}`;
    case "edit_section":
      return `Modificato ${action.label}`;
  }
}

export function describeUndo(action: UndoAction): string {
  switch (action.type) {
    case "deletion":
      return `Annullata eliminazione ${action.label}`;
    case "reconnect":
      return `Annullato ricollegamento ${action.label}`;
    case "move":
      return `Annullato spostamento ${action.label}`;
    case "create_connection":
      return `Annullata creazione connessione ${action.label}`;
    case "create_node":
      return `Annullata creazione ${action.label}`;
    case "edit_node":
      return `Annullata modifica ${action.label}`;
    case "edit_connection":
      return `Annullata modifica connessione ${action.label}`;
    case "create_section":
      return `Annullata creazione ${action.label}`;
    case "delete_section":
      return `Annullata eliminazione ${action.label}`;
    case "move_section":
      return `Annullato spostamento ${action.label}`;
    case "resize_section":
      return `Annullata ridimensione ${action.label}`;
    case "edit_section":
      return `Annullata modifica ${action.label}`;
  }
}

export function describeRedo(action: UndoAction): string {
  switch (action.type) {
    case "deletion":
      return `Ripetuta eliminazione ${action.label}`;
    case "reconnect":
      return `Ripetuto ricollegamento ${action.label}`;
    case "move":
      return `Ripetuto spostamento ${action.label}`;
    case "create_connection":
      return `Ripetuta creazione connessione ${action.label}`;
    case "create_node":
      return `Ripetuta creazione ${action.label}`;
    case "edit_node":
      return `Ripetuta modifica ${action.label}`;
    case "edit_connection":
      return `Ripetuta modifica connessione ${action.label}`;
    case "create_section":
      return `Ripetuta creazione ${action.label}`;
    case "delete_section":
      return `Ripetuta eliminazione ${action.label}`;
    case "move_section":
      return `Ripetuto spostamento ${action.label}`;
    case "resize_section":
      return `Ripetuta ridimensione ${action.label}`;
    case "edit_section":
      return `Ripetuta modifica ${action.label}`;
  }
}

/** Icon hint for the toast (returns a key the UI maps to an icon). */
export type ToastIcon = "trash" | "link" | "move" | "edit";
export function actionIcon(action: UndoAction): ToastIcon {
  switch (action.type) {
    case "deletion": return "trash";
    case "reconnect": return "link";
    case "move": return "move";
    case "create_connection": return "link";
    case "create_node": return "move";
    case "edit_node": return "edit";
    case "edit_connection": return "link";
    case "create_section": return "move";
    case "delete_section": return "trash";
    case "move_section": return "move";
    case "resize_section": return "move";
    case "edit_section": return "edit";
  }
}