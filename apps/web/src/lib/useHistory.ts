import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Undo and redo over a value, where a *step* is a gesture rather than a frame.
 *
 * The distinction is the whole problem. A drag calls back sixty times a second,
 * and a history that recorded each call would bury one drag under a hundred
 * entries — undo would then walk the pointer backwards across the screen
 * instead of putting the drawing back. So there are two ways to change the
 * value: `commit` opens a new step, `set` continues the one in progress. A drag
 * commits its first frame and sets every frame after it, which is exactly one
 * entry however long the drag ran.
 *
 * `past` holds values, not diffs. A skeleton is small and immutable and the
 * edits already rebuild it, so storing snapshots costs about what storing
 * patches would and cannot drift from the thing it claims to describe.
 */
export interface History<T> {
  present: T;
  /** Replace the value and open a new step. */
  commit: (next: T) => void;
  /** Replace the value within the step already open. */
  set: (next: T) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** Start again from `value`, forgetting everything. For switching subject. */
  reset: (value: T) => void;
  depth: number;
}

/** How many steps back it is worth being able to go. */
const LIMIT = 100;

export function useHistory<T>(initial: T): History<T> {
  const [state, setState] = useState<{ past: T[]; present: T; future: T[] }>(() => ({
    past: [],
    present: initial,
    future: [],
  }));

  const commit = useCallback((next: T) => {
    setState((was) => {
      if (Object.is(was.present, next)) return was;
      const past = [...was.past, was.present];
      // Dropping the oldest rather than refusing the newest: a long session
      // should keep its recent history, not freeze at its first hundred edits.
      return { past: past.length > LIMIT ? past.slice(past.length - LIMIT) : past, present: next, future: [] };
    });
  }, []);

  const set = useCallback((next: T) => {
    setState((was) => (Object.is(was.present, next) ? was : { ...was, present: next }));
  }, []);

  const undo = useCallback(() => {
    setState((was) => {
      const previous = was.past[was.past.length - 1];
      if (previous === undefined && was.past.length === 0) return was;
      return {
        past: was.past.slice(0, -1),
        present: previous as T,
        future: [was.present, ...was.future],
      };
    });
  }, []);

  const redo = useCallback(() => {
    setState((was) => {
      if (was.future.length === 0) return was;
      return {
        past: [...was.past, was.present],
        present: was.future[0] as T,
        future: was.future.slice(1),
      };
    });
  }, []);

  const reset = useCallback((value: T) => setState({ past: [], present: value, future: [] }), []);

  return {
    present: state.present,
    commit,
    set,
    undo,
    redo,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    reset,
    depth: state.past.length,
  };
}

/**
 * ⌘Z and ⇧⌘Z, except where the browser already means something by them.
 *
 * A text field has its own undo stack and it is the better one while the caret
 * is in it — taking the keystroke there would undo somebody's typing by
 * reverting the drawing, which is not a surprise anyone recovers from quickly.
 */
export function useUndoKeys(history: Pick<History<unknown>, "undo" | "redo">, enabled = true): void {
  const ref = useRef(history);
  ref.current = history;

  useEffect(() => {
    if (!enabled) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "z" && event.key.toLowerCase() !== "y") return;
      if (!(event.metaKey || event.ctrlKey)) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      event.preventDefault();
      const redo = event.key.toLowerCase() === "y" || event.shiftKey;
      if (redo) ref.current.redo();
      else ref.current.undo();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [enabled]);
}
