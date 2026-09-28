/**
 * @vitest-environment jsdom
 *
 * The resizable `Drawer.Content`: pointer drag, keyboard, clamping, persisted
 * width restore, and storage that throws. jsdom has no layout, so the rendered
 * width reads as 0 and the drag starts from the drawer's own width state, the
 * same fallback a real browser never needs.
 *
 * Also `Drawer.Root` focus restoration: Ark returns focus to the opener only
 * for a drawer that traps focus, and `Root` covers the non-modal case.
 */
import { LocaleProvider } from '@ark-ui/react/locale';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { act, createElement, useState, type ComponentProps } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
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

function drawerTree(contentProps: Partial<ContentProps>, locale = 'en-US') {
  return createElement(
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
  );
}

function renderDrawer(
  contentProps: Partial<ContentProps> = {},
  locale = 'en-US',
) {
  return render(drawerTree(contentProps, locale));
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

const silenceWarnings = () =>
  vi.spyOn(console, 'warn').mockImplementation(() => {});

/** Stands in for layout: jsdom reports every element as 0px wide. */
function stubRenderedWidth(width: number) {
  vi.spyOn(content(), 'getBoundingClientRect').mockReturnValue({
    width,
  } as DOMRect);
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
    silenceWarnings();
    const getItem = vi.fn(() => '600');
    renderDrawer({ storageKey: 'w', storage: { getItem, setItem: vi.fn() } });
    expect(getItem).not.toHaveBeenCalled();
  });

  it('warns once, in development, about resize props it ignores', () => {
    const warn = silenceWarnings();
    const { rerender } = renderDrawer({ storageKey: 'w', minWidth: 400 });
    rerender(drawerTree({ storageKey: 'w', minWidth: 400 }));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain(
      '`minWidth`, `storageKey` without `resizable`',
    );
  });

  it('does not warn without resize props', () => {
    const warn = silenceWarnings();
    renderDrawer({ size: 'sm' });
    expect(warn).not.toHaveBeenCalled();
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

  it.each([
    ['sm', '352px'],
    ['md', '448px'],
    ['lg', '640px'],
  ] as const)('starts a %s drawer at %s', (size, width) => {
    renderDrawer({ resizable: true, size });
    expect(content().style.width).toBe(width);
  });

  it('puts the handle last in the content, opted out of swipe-to-dismiss', () => {
    renderDrawer({ resizable: true });
    expect(content().lastElementChild).toBe(handle());
    expect(handle().hasAttribute('data-no-drag')).toBe(true);
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
    expect(handle().getAttribute('aria-valuenow')).toBe('548');
    // Not written mid-drag, only once the pointer is released.
    expect(values.has('w')).toBe(false);

    fireEvent.pointerUp(handle(), { pointerId: 1, clientX: 400 });
    expect(handle().hasAttribute('data-dragging')).toBe(false);
    expect(values.get('w')).toBe('548');

    // Listeners are gone after release: stray moves change nothing.
    fireEvent.pointerMove(handle(), { pointerId: 1, clientX: 100 });
    expect(content().style.width).toBe('548px');
  });

  it.each([
    [
      'pointercancel',
      () => fireEvent.pointerCancel(handle(), { pointerId: 1 }),
    ],
    [
      'lostpointercapture on the handle',
      () => fireEvent.lostPointerCapture(handle(), { pointerId: 1 }),
    ],
    [
      'lostpointercapture on the document (handle removed)',
      () => fireEvent.lostPointerCapture(document, { pointerId: 1 }),
    ],
  ])('ends the drag and persists on %s', (_, end) => {
    const { storage, values } = memoryStorage();
    renderDrawer({ resizable: true, storageKey: 'w', storage });
    fireEvent.pointerDown(handle(), { button: 0, pointerId: 1, clientX: 500 });
    fireEvent.pointerMove(handle(), { pointerId: 1, clientX: 450 });

    end();
    expect(handle().hasAttribute('data-dragging')).toBe(false);
    expect(values.get('w')).toBe('498');
    fireEvent.pointerMove(handle(), { pointerId: 1, clientX: 100 });
    expect(content().style.width).toBe('498px');
  });

  it("ignores another pointer's lost capture", () => {
    renderDrawer({ resizable: true });
    fireEvent.pointerDown(handle(), { button: 0, pointerId: 1, clientX: 500 });
    fireEvent.lostPointerCapture(document, { pointerId: 2 });
    expect(handle().hasAttribute('data-dragging')).toBe(true);
    fireEvent.pointerMove(handle(), { pointerId: 1, clientX: 450 });
    expect(content().style.width).toBe('498px');
  });

  it('does not write storage for a press without movement', () => {
    const { storage, values } = memoryStorage();
    renderDrawer({ resizable: true, storageKey: 'w', storage });
    drag(500, 500);
    expect(values.has('w')).toBe(false);
  });

  it('re-clamps when minWidth or maxWidth change after mount', () => {
    const { rerender } = renderDrawer({ resizable: true, defaultWidth: 700 });
    rerender(drawerTree({ resizable: true, defaultWidth: 700, maxWidth: 600 }));
    expect(content().style.width).toBe('600px');
    rerender(drawerTree({ resizable: true, defaultWidth: 300, minWidth: 360 }));
    expect(content().style.width).toBe('360px');
  });

  it('steps the keyboard from the rendered width when CSS caps the panel', () => {
    renderDrawer({ resizable: true, defaultWidth: 960 });
    // A 800px viewport: `maxWidth: 100vw` holds the 960px panel at 800px.
    stubRenderedWidth(800);
    fireEvent.keyDown(handle(), { key: 'ArrowRight' });
    expect(content().style.width).toBe('784px');
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

  it('hydrates server markup at the default width, then applies the stored one', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    // The server has no storage: the adapter answers only once hydrating.
    let onClient = false;
    const storage: DrawerWidthStorage = {
      getItem: () => (onClient ? '600' : null),
      setItem: () => {},
    };
    const tree = drawerTree({ resizable: true, storageKey: 'w', storage });
    const container = document.createElement('div');
    container.innerHTML = renderToString(tree);
    document.body.append(container);
    expect(content().style.width).toBe('448px');

    // Testing Library sets this only inside its own helpers.
    const actEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
    onClient = true;
    const root = await act(async () => hydrateRoot(container, tree));
    try {
      expect(content().style.width).toBe('600px');
      expect(handle().getAttribute('aria-valuenow')).toBe('600');
      // A hydration mismatch is reported through console.error.
      expect(error).not.toHaveBeenCalled();
    } finally {
      act(() => root.unmount());
      container.remove();
      delete actEnvironment.IS_REACT_ACT_ENVIRONMENT;
    }
  });

  it('reads storage when storageKey or resizable change after mount', () => {
    const { storage } = memoryStorage({ a: '500', b: '700' });
    const { rerender } = renderDrawer({ storageKey: 'a', storage });
    rerender(drawerTree({ resizable: true, storageKey: 'a', storage }));
    expect(content().style.width).toBe('500px');
    rerender(drawerTree({ resizable: true, storageKey: 'b', storage }));
    expect(content().style.width).toBe('700px');
  });

  it('keeps the width changed in this mount over a stored one', () => {
    const { storage, values } = memoryStorage({ w: '600' });
    renderDrawer({ resizable: true, storageKey: 'w', storage });
    fireEvent.keyDown(handle(), { key: 'ArrowLeft' });
    values.set('w', '400');
    fireEvent.keyDown(handle(), { key: 'ArrowLeft' });
    expect(content().style.width).toBe('632px');
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
      const warn = silenceWarnings();
      const { storage } = memoryStorage({ w: stored });
      renderDrawer({ resizable: true, storageKey: 'w', storage });
      expect(content().style.width).toBe('448px');
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0]?.[0]).toContain('not a finite number');
    },
  );

  it('keeps working when the storage adapter throws on read and write', () => {
    const warn = silenceWarnings();
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

    // Said in development, so a broken adapter is not silent: one read
    // warning per mount, and each failed write with its error.
    const messages = warn.mock.calls.map(([message]) => String(message));
    expect(messages.filter((m) => m.includes('could not read'))).toHaveLength(
      1,
    );
    expect(messages.filter((m) => m.includes('could not write'))).toHaveLength(
      2,
    );
    expect(warn.mock.calls.at(-1)?.[1]).toEqual(
      new Error('QuotaExceededError'),
    );
  });

  it('keeps working when touching window.localStorage itself throws', () => {
    silenceWarnings();
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    renderDrawer({ resizable: true, storageKey: 'w' });
    expect(content().style.width).toBe('448px');
    fireEvent.keyDown(handle(), { key: 'ArrowLeft' });
    expect(content().style.width).toBe('464px');
  });
});

describe('Drawer.Content onWidthChange (uncontrolled)', () => {
  it('reports each drag and key change, deduping moves clamped to a bound', () => {
    const onWidthChange = vi.fn();
    const { storage, values } = memoryStorage();
    renderDrawer({ resizable: true, onWidthChange, storageKey: 'w', storage });

    fireEvent.pointerDown(handle(), { button: 0, pointerId: 1, clientX: 500 });
    fireEvent.pointerMove(handle(), { pointerId: 1, clientX: 450 });
    fireEvent.pointerMove(handle(), { pointerId: 1, clientX: -1000 });
    fireEvent.pointerMove(handle(), { pointerId: 1, clientX: -2000 });
    fireEvent.pointerUp(handle(), { pointerId: 1, clientX: -2000 });
    expect(onWidthChange.mock.calls).toEqual([[498], [960]]);
    expect(content().style.width).toBe('960px');
    expect(values.get('w')).toBe('960');

    fireEvent.keyDown(handle(), { key: 'ArrowRight' });
    expect(onWidthChange).toHaveBeenLastCalledWith(944);
    // Already at the bound: no change, so no call and no write.
    fireEvent.keyDown(handle(), { key: 'Home' });
    onWidthChange.mockClear();
    fireEvent.keyDown(handle(), { key: 'Home' });
    expect(onWidthChange).not.toHaveBeenCalled();
  });
});

describe('Drawer.Content controlled width', () => {
  it('renders the prop and only reports drags until the prop changes', () => {
    const onWidthChange = vi.fn();
    const props = { resizable: true, width: 500, onWidthChange };
    const { rerender } = renderDrawer(props);
    expect(content().style.width).toBe('500px');

    drag(500, 400);
    expect(onWidthChange).toHaveBeenLastCalledWith(600);
    expect(content().style.width).toBe('500px');
    expect(handle().getAttribute('aria-valuenow')).toBe('500');

    rerender(drawerTree({ ...props, width: 600 }));
    expect(content().style.width).toBe('600px');
  });

  it('reports key presses from the controlled width without moving', () => {
    const onWidthChange = vi.fn();
    renderDrawer({ resizable: true, width: 500, onWidthChange });
    fireEvent.keyDown(handle(), { key: 'ArrowLeft' });
    fireEvent.keyDown(handle(), { key: 'ArrowLeft' });
    // Both steps start from the prop, which never changed.
    expect(onWidthChange.mock.calls).toEqual([[516], [516]]);
    fireEvent.keyDown(handle(), { key: 'End' });
    expect(onWidthChange).toHaveBeenLastCalledWith(960);
    expect(content().style.width).toBe('500px');
  });

  it('renders an out-of-bounds width clamped, without reporting the correction', () => {
    const onWidthChange = vi.fn();
    const { rerender } = renderDrawer({
      resizable: true,
      width: 5000,
      onWidthChange,
    });
    expect(content().style.width).toBe('960px');
    rerender(drawerTree({ resizable: true, width: 10, onWidthChange }));
    expect(content().style.width).toBe('320px');
    expect(onWidthChange).not.toHaveBeenCalled();
    // A drag reports a clamped width too.
    drag(500, -5000);
    expect(onWidthChange).toHaveBeenLastCalledWith(960);
  });

  it('ignores storageKey: no read, no write, one dev warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const getItem = vi.fn(() => '700');
    const setItem = vi.fn();
    const props = {
      resizable: true,
      width: 500,
      storageKey: 'w',
      storage: { getItem, setItem },
    };
    const { rerender } = renderDrawer(props);
    expect(content().style.width).toBe('500px');

    drag(500, 400);
    fireEvent.keyDown(handle(), { key: 'ArrowLeft' });
    rerender(drawerTree({ ...props, width: 520 }));

    expect(getItem).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('`width` and `storageKey`');
  });

  it('does not warn for an uncontrolled drawer with storageKey', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    renderDrawer({ resizable: true, storageKey: 'w' });
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns once when minWidth is larger than maxWidth', () => {
    const warn = silenceWarnings();
    renderDrawer({ resizable: true, minWidth: 700, maxWidth: 500 });
    expect(content().style.width).toBe('700px');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('larger than its `maxWidth`');
  });
});

describe('Drawer.Root focus restoration', () => {
  type RootProps = ComponentProps<typeof Drawer.Root>;

  // A host-owned opener, as in a filter rail that opens a non-modal drawer.
  function FocusHarness({
    rootProps = {},
    withOutsideInput = false,
  }: {
    rootProps?: Partial<RootProps>;
    withOutsideInput?: boolean;
  }) {
    const [open, setOpen] = useState(false);
    return createElement(
      'div',
      null,
      createElement(
        'button',
        { type: 'button', onClick: () => setOpen(true) },
        'Open drawer',
      ),
      createElement(
        'button',
        { type: 'button', onClick: () => setOpen(false) },
        'Close from outside',
      ),
      withOutsideInput
        ? createElement('input', { 'aria-label': 'Outside' })
        : null,
      createElement(
        Drawer.Root,
        {
          modal: false,
          ...rootProps,
          open,
          onOpenChange: (details: { open: boolean }) => setOpen(details.open),
        },
        createElement(
          Drawer.Positioner,
          null,
          createElement(
            Drawer.Content,
            null,
            createElement(Drawer.Title, { tabIndex: -1 }, 'Refine'),
            createElement('input', { 'aria-label': 'Min amount' }),
          ),
        ),
      ),
    );
  }

  // An uncontrolled drawer opened by its own `Drawer.Trigger`.
  function triggerTree(rootProps: Partial<RootProps> = {}) {
    return createElement(
      Drawer.Root,
      { modal: false, ...rootProps },
      createElement(Drawer.Trigger, null, 'Open drawer'),
      createElement(
        Drawer.Positioner,
        null,
        createElement(
          Drawer.Content,
          null,
          createElement('input', { 'aria-label': 'Min amount' }),
        ),
      ),
    );
  }

  const opener = () => screen.getByRole('button', { name: 'Open drawer' });
  const inside = () => screen.getByLabelText('Min amount');

  async function openFromButton() {
    opener().focus();
    fireEvent.click(opener());
    // Ark moves focus into the content a frame after it opens.
    await waitFor(() => {
      expect(content().contains(document.activeElement)).toBe(true);
    });
  }

  function pressEscape() {
    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: 'Escape',
    });
  }

  it('returns focus to the opener when a non-modal drawer closes on Escape', async () => {
    render(createElement(FocusHarness));
    await openFromButton();
    inside().focus();

    pressEscape();

    await waitFor(() => {
      expect(content().hidden).toBe(true);
    });
    expect(document.activeElement).toBe(opener());
  });

  it('returns focus to a Drawer.Trigger in an uncontrolled non-modal drawer', async () => {
    render(triggerTree());
    await openFromButton();

    pressEscape();

    await waitFor(() => {
      expect(document.activeElement).toBe(opener());
    });
  });

  it('falls back to the trigger when clicking it did not focus it', async () => {
    // Safari and macOS Firefox do not focus a clicked button, so focus is
    // still on <body> when the drawer opens.
    render(triggerTree());
    fireEvent.click(opener());
    await waitFor(() => {
      expect(content().contains(document.activeElement)).toBe(true);
    });

    pressEscape();

    await waitFor(() => {
      expect(document.activeElement).toBe(opener());
    });
  });

  it('falls back to the trigger for a drawer that starts open', async () => {
    render(triggerTree({ defaultOpen: true }));
    await waitFor(() => {
      expect(content().contains(document.activeElement)).toBe(true);
    });

    pressEscape();

    await waitFor(() => {
      expect(document.activeElement).toBe(opener());
    });
  });

  it('keeps focus where the user moved it outside a non-modal drawer', async () => {
    render(createElement(FocusHarness, { withOutsideInput: true }));
    await openFromButton();
    const outside = screen.getByLabelText('Outside');
    outside.focus();

    fireEvent.click(screen.getByRole('button', { name: 'Close from outside' }));

    await waitFor(() => {
      expect(content().hidden).toBe(true);
    });
    expect(document.activeElement).toBe(outside);
  });

  it('leaves focus alone with restoreFocus={false}', async () => {
    render(createElement(FocusHarness, { rootProps: { restoreFocus: false } }));
    await openFromButton();

    pressEscape();

    await waitFor(() => {
      expect(content().hidden).toBe(true);
    });
    expect(document.activeElement).not.toBe(opener());
  });

  it('prefers finalFocusEl over the opener', async () => {
    const target = document.createElement('button');
    document.body.append(target);
    try {
      render(
        createElement(FocusHarness, {
          rootProps: { finalFocusEl: () => target },
        }),
      );
      await openFromButton();

      pressEscape();

      await waitFor(() => {
        expect(document.activeElement).toBe(target);
      });
    } finally {
      target.remove();
    }
  });

  it('keeps the opener across re-renders while open', async () => {
    // A fresh inline `finalFocusEl` on every render, returning nothing, so the
    // opener captured on open is what focus must return to.
    const tree = () =>
      createElement(FocusHarness, { rootProps: { finalFocusEl: () => null } });
    const { rerender } = render(tree());
    await openFromButton();
    inside().focus();
    rerender(tree());

    pressEscape();

    await waitFor(() => {
      expect(document.activeElement).toBe(opener());
    });
  });

  it('lands initial focus on initialFocusEl, such as the title', async () => {
    render(
      createElement(FocusHarness, {
        rootProps: {
          initialFocusEl: () =>
            document.querySelector<HTMLElement>('.drawer__title'),
        },
      }),
    );
    opener().focus();
    fireEvent.click(opener());

    await waitFor(() => {
      expect(document.activeElement).toBe(
        screen.getByRole('heading', { name: 'Refine' }),
      );
    });
  });

  it('still returns focus in a modal drawer (via Ark)', async () => {
    render(createElement(FocusHarness, { rootProps: { modal: true } }));
    await openFromButton();

    pressEscape();

    await waitFor(() => {
      expect(document.activeElement).toBe(opener());
    });
  });
});
