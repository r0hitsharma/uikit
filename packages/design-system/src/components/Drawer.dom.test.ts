/**
 * @vitest-environment jsdom
 *
 * The resizable `Drawer.Content`: pointer drag, keyboard, clamping, persisted
 * width restore, and storage that throws. jsdom has no layout, so the rendered
 * width reads as 0 and the drag starts from the drawer's own width state, the
 * same fallback a real browser never needs.
 */
import { LocaleProvider } from '@ark-ui/react/locale';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { createElement, type ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Drawer, type DrawerWidthStorage } from './Drawer.js';

// jsdom ships no `ResizeObserver`, and Ark's drawer machine constructs one to
// measure the open content. Nothing here depends on it firing.
class NoopResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
globalThis.ResizeObserver ??= NoopResizeObserver as never;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

type ContentProps = ComponentProps<typeof Drawer.Content>;

function renderDrawer(
  contentProps: Partial<ContentProps> = {},
  locale = 'en-US',
) {
  return render(
    createElement(
      LocaleProvider,
      { locale },
      createElement(
        Drawer.Root,
        { open: true },
        createElement(
          Drawer.Positioner,
          null,
          createElement(
            Drawer.Content,
            contentProps as ContentProps,
            createElement(Drawer.Title, null, 'Details'),
          ),
        ),
      ),
    ),
  );
}

function content(): HTMLElement {
  const element = document.querySelector<HTMLElement>('.drawer__content');
  if (!element) throw new Error('drawer content not rendered');
  return element;
}

const handle = () => screen.getByRole('separator', { name: 'Resize drawer' });

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  const storage: DrawerWidthStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
  return { storage, values };
}

function drag(from: number, to: number) {
  fireEvent.pointerDown(handle(), { button: 0, pointerId: 1, clientX: from });
  fireEvent.pointerMove(handle(), { pointerId: 1, clientX: to });
  fireEvent.pointerUp(handle(), { pointerId: 1, clientX: to });
}

describe('Drawer.Content without resizable', () => {
  it('renders the fixed-width drawer unchanged: size class, no handle, no inline width', () => {
    renderDrawer({ size: 'lg' });
    expect(content().className).toContain('drawer__content--size_lg');
    expect(content().style.width).toBe('');
    expect(screen.queryByRole('separator')).toBeNull();
  });

  it('never touches storage', () => {
    const getItem = vi.fn(() => '600');
    renderDrawer({ storageKey: 'w', storage: { getItem, setItem: vi.fn() } });
    expect(getItem).not.toHaveBeenCalled();
  });
});

describe('Drawer.Content resizable', () => {
  it('starts at the pixel width of `size` and exposes a labelled vertical separator', () => {
    renderDrawer({ resizable: true, size: 'sm' });
    expect(content().style.width).toBe('352px');
    const separator = handle();
    expect(separator.tabIndex).toBe(0);
    expect(separator.getAttribute('aria-orientation')).toBe('vertical');
    expect(separator.getAttribute('aria-valuenow')).toBe('352');
    expect(separator.getAttribute('aria-valuemin')).toBe('320');
    expect(separator.getAttribute('aria-valuemax')).toBe('960');
  });

  it('honours defaultWidth and a custom accessible name', () => {
    renderDrawer({ resizable: true, defaultWidth: 500, resizeLabel: 'Resize' });
    expect(content().style.width).toBe('500px');
    expect(screen.getByRole('separator', { name: 'Resize' })).toBeTruthy();
  });

  it('widens when dragged towards the inline start and persists on release', () => {
    const { storage, values } = memoryStorage();
    renderDrawer({ resizable: true, storageKey: 'w', storage });

    fireEvent.pointerDown(handle(), { button: 0, pointerId: 1, clientX: 500 });
    expect(handle().hasAttribute('data-dragging')).toBe(true);
    fireEvent.pointerMove(handle(), { pointerId: 1, clientX: 400 });
    expect(content().style.width).toBe('548px');
    // Not written mid-drag, only once the pointer is released.
    expect(values.has('w')).toBe(false);

    fireEvent.pointerUp(handle(), { pointerId: 1, clientX: 400 });
    expect(handle().hasAttribute('data-dragging')).toBe(false);
    expect(values.get('w')).toBe('548');

    // Listeners are gone after release: stray moves change nothing.
    fireEvent.pointerMove(handle(), { pointerId: 1, clientX: 100 });
    expect(content().style.width).toBe('548px');
  });

  it('narrows when dragged towards the inline end, clamped to minWidth', () => {
    renderDrawer({ resizable: true, minWidth: 400 });
    drag(500, 1000);
    expect(content().style.width).toBe('400px');
  });

  it('clamps a drag past maxWidth', () => {
    renderDrawer({ resizable: true, maxWidth: 600 });
    drag(500, 0);
    expect(content().style.width).toBe('600px');
  });

  it('ignores a non-primary button', () => {
    renderDrawer({ resizable: true });
    fireEvent.pointerDown(handle(), { button: 2, pointerId: 1, clientX: 500 });
    fireEvent.pointerMove(handle(), { pointerId: 1, clientX: 100 });
    expect(content().style.width).toBe('448px');
    expect(handle().hasAttribute('data-dragging')).toBe(false);
  });

  it('resizes by keyboard: arrows step, Home and End jump to the bounds', () => {
    const { storage, values } = memoryStorage();
    renderDrawer({ resizable: true, storageKey: 'w', storage });

    fireEvent.keyDown(handle(), { key: 'ArrowLeft' });
    expect(content().style.width).toBe('464px');
    expect(values.get('w')).toBe('464');

    fireEvent.keyDown(handle(), { key: 'ArrowRight' });
    fireEvent.keyDown(handle(), { key: 'ArrowRight' });
    expect(content().style.width).toBe('432px');

    fireEvent.keyDown(handle(), { key: 'End' });
    expect(handle().getAttribute('aria-valuenow')).toBe('960');
    fireEvent.keyDown(handle(), { key: 'ArrowLeft' });
    expect(handle().getAttribute('aria-valuenow')).toBe('960');

    fireEvent.keyDown(handle(), { key: 'Home' });
    expect(handle().getAttribute('aria-valuenow')).toBe('320');
    expect(values.get('w')).toBe('320');
  });

  it('mirrors drag and arrow direction in RTL', () => {
    // Ark takes `dir` from the locale and stamps it on Content.
    renderDrawer({ resizable: true }, 'ar-SA');
    expect(content().getAttribute('dir')).toBe('rtl');
    fireEvent.keyDown(handle(), { key: 'ArrowRight' });
    expect(content().style.width).toBe('464px');
    drag(500, 400);
    expect(content().style.width).toBe('364px');
  });
});

describe('Drawer.Content persisted width', () => {
  it('restores the stored width on mount', () => {
    const { storage } = memoryStorage({ w: '600' });
    renderDrawer({ resizable: true, storageKey: 'w', storage });
    expect(content().style.width).toBe('600px');
  });

  it('restores a width persisted by an earlier mount (reopen after unmount)', () => {
    renderDrawer({ resizable: true, storageKey: 'drawer-width' });
    fireEvent.keyDown(handle(), { key: 'End' });
    expect(window.localStorage.getItem('drawer-width')).toBe('960');
    cleanup();

    renderDrawer({ resizable: true, storageKey: 'drawer-width' });
    expect(content().style.width).toBe('960px');
  });

  it('restores the persisted width when an unmount-on-exit drawer reopens', async () => {
    const tree = (open: boolean) =>
      createElement(
        Drawer.Root,
        { open, lazyMount: true, unmountOnExit: true },
        createElement(
          Drawer.Positioner,
          null,
          createElement(Drawer.Content, {
            resizable: true,
            storageKey: 'drawer-width',
          }),
        ),
      );
    const { rerender } = render(tree(true));
    fireEvent.keyDown(handle(), { key: 'ArrowLeft' });
    expect(content().style.width).toBe('464px');

    rerender(tree(false));
    // Ark's presence unmounts the content once its exit settles.
    await waitFor(() => {
      expect(document.querySelector('.drawer__content')).toBeNull();
    });

    rerender(tree(true));
    await waitFor(() => {
      expect(content().style.width).toBe('464px');
    });
  });

  it('clamps a stored width to the current bounds', () => {
    const { storage } = memoryStorage({ tooWide: '5000', tooNarrow: '10' });
    renderDrawer({ resizable: true, storageKey: 'tooWide', storage });
    expect(content().style.width).toBe('960px');
    cleanup();
    renderDrawer({
      resizable: true,
      storageKey: 'tooNarrow',
      storage,
      minWidth: 360,
    });
    expect(content().style.width).toBe('360px');
  });

  it.each(['', 'abc', 'NaN', 'Infinity'])(
    'falls back to the default width when the stored value is %j',
    (stored) => {
      const { storage } = memoryStorage({ w: stored });
      renderDrawer({ resizable: true, storageKey: 'w', storage });
      expect(content().style.width).toBe('448px');
    },
  );

  it('keeps working when the storage adapter throws on read and write', () => {
    const storage: DrawerWidthStorage = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    renderDrawer({ resizable: true, storageKey: 'w', storage });
    expect(content().style.width).toBe('448px');

    fireEvent.keyDown(handle(), { key: 'ArrowLeft' });
    expect(content().style.width).toBe('464px');
    drag(500, 450);
    expect(content().style.width).toBe('514px');
  });

  it('keeps working when touching window.localStorage itself throws', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    renderDrawer({ resizable: true, storageKey: 'w' });
    expect(content().style.width).toBe('448px');
    fireEvent.keyDown(handle(), { key: 'ArrowLeft' });
    expect(content().style.width).toBe('464px');
  });
});
