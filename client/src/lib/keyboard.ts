// Keyboard helpers (§9.4 v1.9). The "highlight" is real keyboard focus on a task row, so screen
// readers follow it and Enter opens the row's link natively.

const ROW = '[data-task-row]';

/** Task id of the focused list row or board card, if any. */
export function focusedTaskId(): string | null {
  const el = document.activeElement;
  if (!(el instanceof HTMLElement)) return null;
  return el.closest<HTMLElement>('[data-task-id]')?.dataset.taskId ?? null;
}

/** J/K and ↓/↑: move focus to the next/previous list row. */
export function moveRowFocus(delta: 1 | -1) {
  const rows = [...document.querySelectorAll<HTMLElement>(ROW)];
  if (rows.length === 0) return;
  const current = rows.findIndex((r) => r === document.activeElement);
  const next =
    current === -1
      ? delta > 0
        ? 0
        : rows.length - 1
      : Math.min(rows.length - 1, Math.max(0, current + delta));
  rows[next]!.focus();
  rows[next]!.scrollIntoView({ block: 'nearest' });
}

export function focusTaskRow(id: string) {
  document.querySelector<HTMLElement>(`[data-task-id="${CSS.escape(id)}"]`)?.focus();
}

/** True while a Radix dialog, popover or menu is open; they handle their own Esc. */
export function overlayOpen(): boolean {
  return !!document.querySelector(
    '[role="dialog"], [role="menu"], [data-radix-popper-content-wrapper]',
  );
}
