"use client";

import { useEffect, type RefObject } from "react";

/**
 * The keyboard and focus behaviour every overlay in the admin owes its user.
 *
 * Extracted from `AdminModal` so the one overlay that cannot use it — the
 * parenting article editor, which needs the whole screen and its own header —
 * still behaves like a dialog rather than merely looking like one.
 *
 * None of this is decoration:
 *  - **Escape** is what a non-technical user reaches for long before they find
 *    a close button.
 *  - **Focus trapping** stops Tab walking out into the page behind, where the
 *    next Enter presses a control the user cannot see.
 *  - **Focus restore** puts the caret back on whatever opened the overlay,
 *    instead of dumping it at the top of the document.
 *  - **Scroll lock** stops the page behind scrolling under the overlay.
 */
export function useDialogBehaviour(
  open: boolean,
  panelRef: RefObject<HTMLElement | null>,
  onClose: () => void,
) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !panel.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [open, onClose, panelRef]);

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Focus the panel itself rather than its first field: dropping the caret
    // straight into a text input reads as if the form has already been started,
    // and screen readers announce the field instead of the dialog.
    panelRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      opener?.focus?.();
    };
  }, [open, panelRef]);
}
