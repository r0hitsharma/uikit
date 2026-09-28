/**
 * @vitest-environment jsdom
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { renderToStaticMarkup, renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';

import { HarnessConnect } from './HarnessConnect.js';

// jsdom has no ResizeObserver; Ark's Tabs measure their indicator with one.
class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= NoopResizeObserver as never;

const TOKEN = 'tok_SECRET_4f9c2e';
const props = {
  indicatorStatus: 'connected' as const,
  relayBaseUrl: 'https://relay.example.test',
  connectionToken: TOKEN,
};

afterEach(cleanup);

// The bearer connection token must not be in the page (server HTML or the
// client tree) while the dialog is closed.
describe('HarnessConnect connection token', () => {
  it('is absent from the server HTML while closed', () => {
    expect(renderToString(<HarnessConnect {...props} />)).not.toContain(TOKEN);
  });

  it('is present in the server HTML when defaultOpen', () => {
    expect(renderToString(<HarnessConnect {...props} defaultOpen />)).toContain(
      TOKEN,
    );
  });

  it('enters the DOM only while open, and leaves it on close', async () => {
    render(<HarnessConnect {...props} />);
    expect(document.documentElement.outerHTML).not.toContain(TOKEN);

    fireEvent.click(
      screen.getByRole('button', { name: /open harness connect/i }),
    );
    await waitFor(() => expect(document.body.outerHTML).toContain(TOKEN));

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() =>
      expect(document.documentElement.outerHTML).not.toContain(TOKEN),
    );
  });
});

describe('HarnessConnect size', () => {
  it.each([
    ['sm', 14],
    ['md', 14],
    ['lg', 16],
  ] as const)('renders a %s trigger with a %ipx icon', (size, iconSize) => {
    const container = document.createElement('div');
    container.innerHTML = renderToStaticMarkup(
      <HarnessConnect {...props} size={size} />,
    );
    const trigger = container.querySelector('button');
    const icon = trigger?.querySelector('svg');

    expect(trigger?.classList).toContain(`button--size_${size}`);
    expect(trigger?.classList).toContain('button--iconOnly_true');
    expect(icon?.getAttribute('width')).toBe(String(iconSize));
    expect(icon?.getAttribute('height')).toBe(String(iconSize));
  });

  it('defaults to md', () => {
    const container = document.createElement('div');
    container.innerHTML = renderToStaticMarkup(<HarnessConnect {...props} />);

    expect(container.querySelector('button')?.classList).toContain(
      'button--size_md',
    );
  });
});
