"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { HelpCircle } from "lucide-react";

/**
 * A hover/focus/tap hint for a form field.
 *
 * The people running these two portals are not technical. Fields like "SKU",
 * "reorder point", "stackable" and "automatic" are obvious to whoever wrote
 * the schema and opaque to the person who has to fill them in, and there was
 * no tooltip anywhere in the codebase to lean on — no radix, no headlessui, no
 * shadcn, and exactly four native `title=` attributes in the whole tree.
 *
 * Three things this handles that a `title=` attribute does not:
 *
 *  - **Touch.** Shop staff use tablets. `title=` never appears on a tablet, and
 *    a hover-only tooltip is invisible to exactly the users who need it most.
 *    Tapping the trigger pins the hint open here.
 *  - **Keyboard and screen readers.** The trigger is a real button, the panel
 *    is wired with `aria-describedby`, so the hint is announced with the field
 *    rather than being decoration only sighted mouse users ever discover.
 *  - **Clipping.** The panel renders in a portal, positioned from the
 *    trigger's viewport rect. `AdminModal`'s body is `overflow-y-auto`, so an
 *    absolutely-positioned panel would be cut off at the bottom edge of the
 *    form — which is precisely where the fields that need explaining sit.
 */
export function AdminHint({
  children,
  label = "What is this?",
}: {
  children: ReactNode;
  /** Accessible name for the trigger. Override when several hints sit close together. */
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelId = useId();

  const place = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const panelWidth = 264;
    // Keep the panel on screen on a narrow tablet held in portrait.
    const left = Math.min(
      Math.max(8, rect.left + rect.width / 2 - panelWidth / 2),
      Math.max(8, window.innerWidth - panelWidth - 8),
    );
    setPosition({ top: rect.bottom + 8, left });
  }, []);

  const show = useCallback(() => {
    place();
    setOpen(true);
  }, [place]);

  const hide = useCallback(() => {
    if (pinned) return;
    setOpen(false);
  }, [pinned]);

  const dismiss = useCallback(() => {
    setPinned(false);
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      // Swallow it, or Escape closes the surrounding AdminModal too and the
      // user loses the form they were part-way through filling in.
      event.stopPropagation();
      dismiss();
      triggerRef.current?.focus();
    }
    // `place` on scroll/resize because the panel is positioned in viewport
    // coordinates and AdminModal's body scrolls underneath it.
    document.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, place, dismiss]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? panelId : undefined}
        onPointerEnter={(event) => {
          // Touch fires pointerenter immediately before click; letting it open
          // here would make the click that follows read as "close".
          if (event.pointerType === "touch") return;
          show();
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === "touch") return;
          hide();
        }}
        onFocus={show}
        onBlur={hide}
        onClick={() => {
          if (pinned) {
            dismiss();
            return;
          }
          setPinned(true);
          show();
        }}
        className="inline-grid h-5 w-5 shrink-0 place-items-center rounded-full text-[var(--color-ink-soft)] transition hover:bg-[var(--color-brand-tint)] hover:text-[var(--color-brand-deep)]"
      >
        <HelpCircle size={15} aria-hidden="true" />
      </button>
      {open &&
        position &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            id={panelId}
            role="tooltip"
            style={{ top: position.top, left: position.left, width: 264 }}
            className="pointer-events-none fixed z-[100] rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] px-3.5 py-3 text-xs leading-5 text-[var(--color-ink)] shadow-lg"
          >
            {children}
          </div>,
          document.body,
        )}
    </>
  );
}

/**
 * A field label with its hint attached.
 *
 * Most call sites want exactly this and nothing more, so adding an explanation
 * to a field stays a one-prop change and there is no excuse to skip it.
 */
export function HintedLabel({
  label,
  hint,
  htmlFor,
  required,
}: {
  label: string;
  hint?: ReactNode;
  htmlFor?: string;
  required?: boolean;
}) {
  return (
    <span className="flex items-center gap-1.5">
      {/*
        The required marker sits OUTSIDE the <label>. `aria-hidden` already
        keeps it out of the accessible name, but leaving it inside meant the
        label's text content read "Store name*", which breaks any exact-match
        label lookup — a real tool hit that on this very form. Required-ness is
        conveyed to assistive tech by the control's own `required` attribute.
      */}
      <label htmlFor={htmlFor} className="text-sm font-semibold text-[var(--color-ink)]">
        {label}
      </label>
      {required && (
        <span aria-hidden="true" className="-ml-1 text-[var(--color-brand-deep)]">
          *
        </span>
      )}
      {hint && <AdminHint label={`What is ${label}?`}>{hint}</AdminHint>}
    </span>
  );
}

/**
 * Label + hint + control, in the vertical rhythm the admin forms already use.
 */
export function HintedField({
  label,
  hint,
  htmlFor,
  required,
  error,
  children,
}: {
  label: string;
  hint?: ReactNode;
  htmlFor?: string;
  required?: boolean;
  /** Field-level message. Rendered in the flow so it cannot be missed. */
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <div className="block">
      <HintedLabel label={label} hint={hint} htmlFor={htmlFor} required={required} />
      <div className="mt-2">{children}</div>
      {error && (
        <p role="alert" className="mt-1.5 text-xs font-medium text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
