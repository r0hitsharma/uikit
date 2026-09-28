import { Drawer as ArkDrawer } from '@ark-ui/react/drawer';
import { Portal } from '@ark-ui/react/portal';
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentPropsWithoutRef,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';

import { IS_DEV_WARNING_ENABLED } from '../hooks/devWarning.js';

/**
 * Class names emitted by the `drawer` slot recipe (registered in the preset).
 * The design-system package builds with `tsc` and ships no generated
 * `styled-system`, so the recipe is applied by its stable slot class names
 * (Panda convention: `${className}__${slot}`). The recipe must be added to
 * `staticCss` so these classes are always generated. Behavior (Esc handling,
 * scrim, scroll-lock, focus trap) comes from Ark; this file only skins it.
 */
const slots = {
  backdrop: 'drawer__backdrop',
  positioner: 'drawer__positioner',
  content: 'drawer__content',
  title: 'drawer__title',
  description: 'drawer__description',
  closeTrigger: 'drawer__closeTrigger',
  resizeHandle: 'drawer__resizeHandle',
} as const;

const cx = (...classes: Array<string | false | null | undefined>): string =>
  classes.filter(Boolean).join(' ');

function DrawerBackdrop({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof ArkDrawer.Backdrop>) {
  return (
    <ArkDrawer.Backdrop {...props} className={cx(slots.backdrop, className)} />
  );
}

function DrawerPositioner({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof ArkDrawer.Positioner>) {
  return (
    <ArkDrawer.Positioner
      {...props}
      className={cx(slots.positioner, className)}
    />
  );
}

type DrawerSize = 'sm' | 'md' | 'lg';

/**
 * Where a resizable drawer persists its width. Structurally a subset of the Web
 * Storage API, so `window.sessionStorage` (or any object with these two
 * methods) can be passed as-is. Either method may throw: the drawer treats a
 * throw as "nothing stored" on read and ignores it on write.
 */
export type DrawerWidthStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

// Pixel equivalents of the `size` variants' rem widths (at a 16px root): the
// starting width of a resizable drawer with no `defaultWidth`.
const SIZE_WIDTHS: Record<DrawerSize, number> = { sm: 352, md: 448, lg: 640 };
const DEFAULT_MIN_WIDTH = 320;
const DEFAULT_MAX_WIDTH = 960;
const KEYBOARD_STEP = 16;

function clampWidth(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * `localStorage`, when the environment has one. Merely touching
 * `window.localStorage` throws in some sandboxed and privacy modes, so it is
 * looked up inside each guarded read or write, never at module load.
 */
function defaultStorage(): DrawerWidthStorage | undefined {
  return typeof window === 'undefined' ? undefined : window.localStorage;
}

/** Snapshot of a storage read that threw. A symbol, so snapshots stay primitive. */
const READ_FAILED = Symbol('read failed');
type StoredWidthSnapshot = string | null | typeof READ_FAILED;

function readStoredWidth(
  storage: DrawerWidthStorage | undefined,
  key: string | undefined,
): StoredWidthSnapshot {
  if (key === undefined) return null;
  try {
    return (storage ?? defaultStorage())?.getItem(key) ?? null;
  } catch {
    return READ_FAILED;
  }
}

/** The stored value as a width, or `undefined` when it is missing or unusable. */
function parseStoredWidth(raw: StoredWidthSnapshot): number | undefined {
  // `Number('')` is 0, so an empty value is rejected before the conversion.
  if (typeof raw !== 'string' || raw.trim() === '') return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

// Storage has no change event worth following here: the drawer reads it on
// render and is the only writer that matters to it.
const subscribeToNothing = () => () => {};
// The server has no storage to read, and hydration must render what it did.
const nothingStored = (): StoredWidthSnapshot => null;

function writeStoredWidth(
  storage: DrawerWidthStorage | undefined,
  key: string | undefined,
  width: number,
): void {
  if (key === undefined) return;
  try {
    (storage ?? defaultStorage())?.setItem(key, String(Math.round(width)));
  } catch (error) {
    // Storage unavailable or over quota: the width still applies for this
    // mount, it just does not survive a remount. Said in development, so a
    // broken `storage` adapter is not mistaken for blocked storage.
    if (IS_DEV_WARNING_ENABLED) {
      console.warn(
        `[uikit] \`Drawer.Content\` could not write its width under "${key}"; ` +
          'it will not survive a remount.',
        error,
      );
    }
  }
}

/**
 * Logs `message` once per mount, in development only, whenever it is defined.
 * The latch is only touched in the effect: a ref is not readable or writable
 * during render.
 */
function useDevWarningOnce(message: string | undefined): void {
  const warned = useRef(false);
  useEffect(() => {
    if (!IS_DEV_WARNING_ENABLED || message === undefined || warned.current) {
      return;
    }
    warned.current = true;
    console.warn(message);
  }, [message]);
}

/** Whether the element lays out right-to-left (Ark stamps `dir` on Content). */
function isRtl(element: HTMLElement): boolean {
  return getComputedStyle(element).direction === 'rtl';
}

type DrawerContentProps = ComponentPropsWithoutRef<typeof ArkDrawer.Content> & {
  /**
   * Panel width. Defaults to `md`. With `resizable`, only the starting width
   * (see `defaultWidth`).
   */
  size?: DrawerSize;
  /**
   * Adds a resize handle on the panel's inner edge, operable by pointer drag
   * and by keyboard (arrow keys, Home, End). Defaults to `false`, which renders
   * exactly the fixed-width drawer.
   */
  resizable?: boolean;
  /**
   * Controlled width in px. When set, it is the source of truth: dragging and
   * the keyboard only call `onWidthChange`, and the panel moves when this prop
   * does. A value outside `minWidth`/`maxWidth` renders clamped. Storage is
   * neither read nor written. Omit for an uncontrolled drawer.
   */
  width?: number;
  /**
   * Uncontrolled starting width in px when nothing is persisted. Defaults to
   * the pixel width of `size`. Ignored when `width` is set.
   */
  defaultWidth?: number;
  /**
   * Called with the new, clamped width whenever a drag or key press changes
   * it (on each pointer move that changes it during a drag), in controlled and
   * uncontrolled mode alike.
   */
  onWidthChange?: (width: number) => void;
  /** Smallest width in px the handle allows. Defaults to `320`. */
  minWidth?: number;
  /** Largest width in px the handle allows. Defaults to `960`. */
  maxWidth?: number;
  /**
   * Uncontrolled only: persists the width under this key (when a drag ends and
   * on each key press) and restores it until the width is changed in this
   * mount. Omit to keep the width in memory only. A stored width is clamped to
   * the current `minWidth`/`maxWidth` when applied. Read after hydration, so a
   * server-rendered drawer hydrates at its default width. Ignored, with a
   * dev-only warning, when `width` is set: the owner of a controlled width owns
   * its persistence too.
   */
  storageKey?: string;
  /** Where `storageKey` is read and written. Defaults to `localStorage`. */
  storage?: DrawerWidthStorage;
  /** Accessible name of the resize handle. Defaults to `Resize drawer`. */
  resizeLabel?: string;
};

function DrawerContent({
  className,
  size = 'md',
  resizable = false,
  width: widthProp,
  defaultWidth,
  onWidthChange,
  minWidth: minWidthProp,
  maxWidth: maxWidthProp,
  storageKey,
  storage,
  resizeLabel: resizeLabelProp,
  style,
  children,
  ...props
}: DrawerContentProps) {
  const minWidth = minWidthProp ?? DEFAULT_MIN_WIDTH;
  const maxWidth = maxWidthProp ?? DEFAULT_MAX_WIDTH;
  const resizeLabel = resizeLabelProp ?? 'Resize drawer';
  const controlled = widthProp !== undefined;
  const persisted = resizable && !controlled && storageKey !== undefined;
  // Read on every render until the width is changed in this mount, so a
  // drawer that unmounts on close (`lazyMount` + `unmountOnExit`) reopens at
  // the persisted width, one that stays mounted keeps its in-memory width, and
  // a `storageKey` or `resizable` that changes later is honoured. The server
  // snapshot keeps hydration on the default width; React then re-renders with
  // the stored one.
  const stored = useSyncExternalStore(
    subscribeToNothing,
    () => (persisted ? readStoredWidth(storage, storageKey) : null),
    nothingStored,
  );
  const storedWidth = parseStoredWidth(stored);
  const [chosenWidth, setChosenWidth] = useState<number>();
  const [dragging, setDragging] = useState(false);

  useDevWarningOnce(
    resizable && controlled && storageKey !== undefined
      ? '[uikit] `Drawer.Content` was given both `width` and `storageKey`. A ' +
          'controlled width is never read from or written to storage; persist ' +
          'it where you hold `width`, or drop `width` to let the drawer do it.'
      : undefined,
  );
  const ignoredProps = resizable
    ? ''
    : Object.entries({
        width: widthProp,
        defaultWidth,
        onWidthChange,
        minWidth: minWidthProp,
        maxWidth: maxWidthProp,
        storageKey,
        storage,
        resizeLabel: resizeLabelProp,
      })
        .filter(([, value]) => value !== undefined)
        .map(([name]) => `\`${name}\``)
        .join(', ');
  useDevWarningOnce(
    ignoredProps
      ? `[uikit] \`Drawer.Content\` was given ${ignoredProps} without ` +
          '`resizable`, so they have no effect. Add `resizable` to use them.'
      : undefined,
  );
  useDevWarningOnce(
    resizable && minWidth > maxWidth
      ? `[uikit] \`Drawer.Content\` was given a \`minWidth\` (${minWidth}) ` +
          `larger than its \`maxWidth\` (${maxWidth}); the width is pinned to ` +
          '`minWidth`.'
      : undefined,
  );
  useDevWarningOnce(
    stored === READ_FAILED
      ? `[uikit] \`Drawer.Content\` could not read the width stored under ` +
          `"${storageKey}" (the storage threw); using the default width.`
      : stored !== null && storedWidth === undefined
        ? `[uikit] \`Drawer.Content\` ignored the value stored under ` +
          `"${storageKey}" (${JSON.stringify(stored)}), which is not a finite ` +
          'number; using the default width.'
        : undefined,
  );
  const contentClassName = cx(
    slots.content,
    `drawer__content--size_${size}`,
    className,
  );

  if (!resizable) {
    return (
      <ArkDrawer.Content {...props} style={style} className={contentClassName}>
        {children}
      </ArkDrawer.Content>
    );
  }

  // Clamped at render rather than when stored, so a persisted or controlled
  // width always honours the bounds the drawer is rendered with now. A
  // controlled width that is out of bounds is rendered clamped but not
  // reported back: `onWidthChange` reports user changes, not corrections.
  const width = clampWidth(
    widthProp ??
      chosenWidth ??
      storedWidth ??
      defaultWidth ??
      SIZE_WIDTHS[size],
    minWidth,
    maxWidth,
  );

  // One path for every user change. Controlled: only report it. Uncontrolled:
  // apply it too, and persist it when asked (`persist` is false mid-drag so
  // storage is written once per gesture, not per pointer move).
  const change = (next: number, persist: boolean) => {
    onWidthChange?.(next);
    if (controlled) return;
    setChosenWidth(next);
    if (persist) writeStoredWidth(storage, storageKey, next);
  };

  // Drag and keyboard start from the rendered width, which CSS can cap below
  // `width` (the content's `maxWidth: 100vw`), so the first pixel of movement
  // or the first key press resizes. Without layout it reads 0: use `width`.
  const startingWidth = (handle: HTMLElement) => {
    const rendered = handle.parentElement?.getBoundingClientRect().width ?? 0;
    return clampWidth(rendered > 0 ? rendered : width, minWidth, maxWidth);
  };

  // The whole drag lives in this handler's closure: the start point and the
  // latest width are locals, and the move/end listeners stay attached until
  // the gesture ends. Nothing is written to a ref, so the component stays
  // React Compiler clean.
  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const handle = event.currentTarget;
    const doc = handle.ownerDocument;
    const { pointerId } = event;
    const startWidth = startingWidth(handle);
    const startX = event.clientX;
    // The panel is anchored to the inline end, so its handle is on the
    // inline-start edge: moving towards the inline start widens it.
    const direction = isRtl(handle) ? 1 : -1;
    let latest = startWidth;
    let moved = false;

    const handleMove = (moveEvent: globalThis.PointerEvent) => {
      const next = clampWidth(
        startWidth + direction * (moveEvent.clientX - startX),
        minWidth,
        maxWidth,
      );
      // Moves past a bound clamp to the same width: report each width once.
      if (next === latest) return;
      latest = next;
      moved = true;
      change(next, false);
    };
    // Runs once, whichever end signal comes first: listeners are removed
    // before capture is released, so the `lostpointercapture` that release
    // fires finds nothing to call.
    const handleEnd = () => {
      handle.removeEventListener('pointermove', handleMove);
      handle.removeEventListener('pointerup', handleEnd);
      handle.removeEventListener('pointercancel', handleEnd);
      doc.removeEventListener('lostpointercapture', handleLostCapture);
      if (handle.hasPointerCapture?.(pointerId)) {
        handle.releasePointerCapture(pointerId);
      }
      setDragging(false);
      if (moved && !controlled) writeStoredWidth(storage, storageKey, latest);
    };
    // Capture can also end with no `pointerup` or `pointercancel` reaching
    // the handle: another element takes it, or the handle leaves the document
    // mid-drag. Listened for on the document, which receives it in both cases.
    const handleLostCapture = (lostEvent: globalThis.PointerEvent) => {
      if (lostEvent.pointerId === pointerId) handleEnd();
    };

    handle.setPointerCapture?.(pointerId);
    handle.addEventListener('pointermove', handleMove);
    handle.addEventListener('pointerup', handleEnd);
    handle.addEventListener('pointercancel', handleEnd);
    doc.addEventListener('lostpointercapture', handleLostCapture);
    setDragging(true);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const widenKey = isRtl(event.currentTarget) ? 'ArrowRight' : 'ArrowLeft';
    const narrowKey = widenKey === 'ArrowLeft' ? 'ArrowRight' : 'ArrowLeft';
    let next: number;
    if (event.key === widenKey || event.key === narrowKey) {
      const step = event.key === widenKey ? KEYBOARD_STEP : -KEYBOARD_STEP;
      next = startingWidth(event.currentTarget) + step;
    } else if (event.key === 'Home') next = minWidth;
    else if (event.key === 'End') next = maxWidth;
    else return;
    event.preventDefault();
    const clamped = clampWidth(next, minWidth, maxWidth);
    if (clamped !== width) change(clamped, true);
  };

  return (
    <ArkDrawer.Content
      {...props}
      style={{ ...style, width }}
      className={contentClassName}
    >
      {children}
      {/* Last in DOM order, so it is last in tab order and Ark's initial focus
          still lands on the drawer's own content. `data-no-drag` stops Ark's
          swipe-to-dismiss from claiming the pointer. */}
      <div
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a focusable separator is the ARIA window-splitter widget; `<hr>` is void and non-interactive, so it can't carry this handle's drag/keyboard behavior
        role="separator"
        tabIndex={0}
        aria-label={resizeLabel}
        aria-orientation="vertical"
        aria-valuenow={Math.round(width)}
        aria-valuemin={minWidth}
        aria-valuemax={maxWidth}
        data-no-drag=""
        data-dragging={dragging ? '' : undefined}
        className={slots.resizeHandle}
        onPointerDown={handlePointerDown}
        onKeyDown={handleKeyDown}
      />
    </ArkDrawer.Content>
  );
}

function DrawerTitle({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof ArkDrawer.Title>) {
  return <ArkDrawer.Title {...props} className={cx(slots.title, className)} />;
}

function DrawerDescription({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof ArkDrawer.Description>) {
  return (
    <ArkDrawer.Description
      {...props}
      className={cx(slots.description, className)}
    />
  );
}

function DrawerCloseTrigger({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof ArkDrawer.CloseTrigger>) {
  return (
    <ArkDrawer.CloseTrigger
      {...props}
      className={cx(slots.closeTrigger, className)}
    />
  );
}

/**
 * Right-anchored Drawer skinned with the `drawer` slot recipe. Composition
 * mirrors Ark: wrap `Backdrop` + `Positioner` in `Drawer.Portal` for correct
 * stacking. Structural parts (`Root`, `Trigger`, `Context`) pass through Ark
 * unchanged so all behavior is preserved. `Content` takes a fixed `size`, or
 * opts into a drag/keyboard resize handle and a persisted width with
 * `resizable`.
 */
export const Drawer = {
  Root: ArkDrawer.Root,
  Trigger: ArkDrawer.Trigger,
  Portal,
  Backdrop: DrawerBackdrop,
  Positioner: DrawerPositioner,
  Content: DrawerContent,
  Title: DrawerTitle,
  Description: DrawerDescription,
  CloseTrigger: DrawerCloseTrigger,
  Context: ArkDrawer.Context,
};
