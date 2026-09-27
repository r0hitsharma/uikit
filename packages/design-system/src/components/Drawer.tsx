import { Drawer as ArkDrawer } from '@ark-ui/react/drawer';
import { Portal } from '@ark-ui/react/portal';
import {
  useState,
  type ComponentPropsWithoutRef,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';

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

function readStoredWidth(
  storage: DrawerWidthStorage | undefined,
  key: string | undefined,
): number | undefined {
  if (key === undefined) return undefined;
  try {
    const raw = (storage ?? defaultStorage())?.getItem(key);
    // `Number('')` is 0, so an empty value is rejected before the conversion.
    if (raw == null || raw.trim() === '') return undefined;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function writeStoredWidth(
  storage: DrawerWidthStorage | undefined,
  key: string | undefined,
  width: number,
): void {
  if (key === undefined) return;
  try {
    (storage ?? defaultStorage())?.setItem(key, String(Math.round(width)));
  } catch {
    // Storage unavailable or over quota: the width still applies for this
    // mount, it just does not survive a remount.
  }
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
   * Starting width in px when nothing is persisted. Defaults to the pixel
   * width of `size`. Only read when `resizable`.
   */
  defaultWidth?: number;
  /** Smallest width in px the handle allows. Defaults to `320`. */
  minWidth?: number;
  /** Largest width in px the handle allows. Defaults to `960`. */
  maxWidth?: number;
  /**
   * Persists the resized width under this key and restores it on mount. Omit
   * to keep the width in memory only. A stored width is clamped to the current
   * `minWidth`/`maxWidth`.
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
  defaultWidth,
  minWidth = DEFAULT_MIN_WIDTH,
  maxWidth = DEFAULT_MAX_WIDTH,
  storageKey,
  storage,
  resizeLabel = 'Resize drawer',
  style,
  children,
  ...props
}: DrawerContentProps) {
  // Read once per mount: a drawer that unmounts on close (`lazyMount` +
  // `unmountOnExit`) restores the persisted width when it reopens, and one
  // that stays mounted keeps its in-memory width.
  const [chosenWidth, setChosenWidth] = useState(() =>
    resizable ? readStoredWidth(storage, storageKey) : undefined,
  );
  const [dragging, setDragging] = useState(false);
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

  // Clamped at render rather than when stored, so a persisted width always
  // honours the bounds the drawer is rendered with now.
  const width = clampWidth(
    chosenWidth ?? defaultWidth ?? SIZE_WIDTHS[size],
    minWidth,
    maxWidth,
  );

  const commit = (next: number) => {
    setChosenWidth(next);
    writeStoredWidth(storage, storageKey, next);
  };

  // The whole drag lives in this handler's closure: the start point and the
  // latest width are locals, and the move/end listeners sit on the captured
  // handle until the pointer is released. Nothing is written to a ref, so the
  // component stays React Compiler clean.
  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const handle = event.currentTarget;
    // Start from the rendered width, which CSS can cap below `width` (the
    // content's `maxWidth: 100vw`), so the first pixel of movement resizes.
    const rendered = handle.parentElement?.getBoundingClientRect().width ?? 0;
    const startWidth = clampWidth(
      rendered > 0 ? rendered : width,
      minWidth,
      maxWidth,
    );
    const startX = event.clientX;
    // The panel is anchored to the inline end, so its handle is on the
    // inline-start edge: moving towards the inline start widens it.
    const direction = isRtl(handle) ? 1 : -1;
    let latest = startWidth;

    const handleMove = (moveEvent: globalThis.PointerEvent) => {
      latest = clampWidth(
        startWidth + direction * (moveEvent.clientX - startX),
        minWidth,
        maxWidth,
      );
      setChosenWidth(latest);
    };
    const handleEnd = (endEvent: globalThis.PointerEvent) => {
      handle.removeEventListener('pointermove', handleMove);
      handle.removeEventListener('pointerup', handleEnd);
      handle.removeEventListener('pointercancel', handleEnd);
      if (handle.hasPointerCapture?.(endEvent.pointerId)) {
        handle.releasePointerCapture(endEvent.pointerId);
      }
      setDragging(false);
      commit(latest);
    };

    handle.setPointerCapture?.(event.pointerId);
    handle.addEventListener('pointermove', handleMove);
    handle.addEventListener('pointerup', handleEnd);
    handle.addEventListener('pointercancel', handleEnd);
    setDragging(true);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const widenKey = isRtl(event.currentTarget) ? 'ArrowRight' : 'ArrowLeft';
    const narrowKey = widenKey === 'ArrowLeft' ? 'ArrowRight' : 'ArrowLeft';
    let next: number;
    if (event.key === widenKey) next = width + KEYBOARD_STEP;
    else if (event.key === narrowKey) next = width - KEYBOARD_STEP;
    else if (event.key === 'Home') next = minWidth;
    else if (event.key === 'End') next = maxWidth;
    else return;
    event.preventDefault();
    commit(clampWidth(next, minWidth, maxWidth));
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
